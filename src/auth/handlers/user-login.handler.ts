import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ChangeBirthdateCommand } from '../commands/change-birthdate.command';
import { PrismaService } from 'src/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserLoginCommand } from '../commands/user-login.command';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@CommandHandler(UserLoginCommand)
export class UserLoginHandler implements ICommandHandler<UserLoginCommand> {
  constructor(
    private prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private jwtService: JwtService,
  ) {}

  async execute(command: UserLoginCommand) {
    const { email, password, context } = command;

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password);

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if the user's refresh token has expired
    const refreshTokens = await this.prisma.refreshToken.findMany({
      where: { userId: user.id },
    });

    const userAgent = context.req.headers['user-agent'] || 'Unknown';
    const ip = context.ip;

    const currentRefreshTokenVersion = user.tokenVersion;
    let newRefreshToken = await this.generateSecureRefreshToken(user);
    let found = false;

    // Check if any of the refresh tokens are still active
    for (const token of refreshTokens) {
      if (
        currentRefreshTokenVersion === token.tokenVersion &&
        token.expires.getTime() > Date.now() &&
        userAgent === token.userAgent &&
        token.revoked === null
      ) {
        await this.prisma.refreshToken.update({
          where: { id: token.id },
          data: { lastUsed: new Date().toUTCString() },
        });
        found = true;
        newRefreshToken = token.token;
        break;
      }
    }

    if (!found) {
      console.log('Creating new refresh token');
      const refreshTokenObj = {
        userId: user.id,
        token: newRefreshToken,
        expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString(),
        tokenVersion: user.tokenVersion,
        created: new Date().toUTCString(),
        createdByIp: ip,
        userAgent: userAgent,
        deviceName: 'Unknown',
      };

      await this.prisma.refreshToken.create({
        data: refreshTokenObj,
      });
    }

    // Update user's last login and connecting IP
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLogin: new Date().toUTCString(),
        connectingIp: ip,
      },
    });

    // If the user has never logged in before with this new IP, send a email using eventEmitter
    const userLogins = await this.prisma.userLogin.findMany({
      where: { userId: user.id },
    });

    if (!userLogins.map((login) => login.ip).includes(context.ip)) {
      this.eventEmitter.emit('auth.new-ip-login', {
        name: user.fullName,
        email: user.email,
        ip,
        userAgent,
      });
    }

    await this.prisma.userLogin.create({
      data: {
        userId: user.id,
        ip: context.ip,
        userAgent: context.req.headers['user-agent'] || 'Unknown',
        createdAt: new Date().toUTCString(),
      },
    });

    return { user, refreshToken: newRefreshToken };
  }

  async generateSecureRefreshToken(user: any) {
    const refreshToken = this.jwtService.sign(
      { sub: user.id },
      { expiresIn: '90d' },
    );

    return refreshToken;
  }
}
