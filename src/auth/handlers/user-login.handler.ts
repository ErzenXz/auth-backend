import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from 'src/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserLoginCommand } from '../commands/user-login.command';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@CommandHandler(UserLoginCommand)
export class UserLoginHandler implements ICommandHandler<UserLoginCommand> {
  /**
   * Handles the user login process by validating credentials and generating a refresh token.
   *
   * This method retrieves the user by email, verifies the provided password, checks for active
   * refresh tokens, and either reuses an existing token or generates a new one. It also updates
   * the user's last login information and emits an event if the login occurs from a new IP address.
   *
   * @param {UserLoginCommand} command - The command containing the user's login credentials and context.
   * @param {string} command.email - The email of the user attempting to log in.
   * @param {string} command.password - The password of the user attempting to log in.
   * @param {any} command.context - The context containing request information, including IP and headers.
   * @throws {UnauthorizedException} Throws an exception if the email or password is invalid.
   * @returns {Promise<{ user: any, refreshToken: string }>} A promise that resolves to an object containing the user details and a refresh token.
   */
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly jwtService: JwtService,
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
    const { ip } = context;

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
          data: { lastUsed: new Date().toISOString() },
        });
        found = true;
        newRefreshToken = token.token;
        break;
      }
    }

    if (!found) {
      const refreshTokenObj = {
        userId: user.id,
        token: newRefreshToken,
        expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        tokenVersion: user.tokenVersion,
        created: new Date().toISOString(),
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
        lastLogin: new Date().toISOString(),
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
        time: new Date().toISOString(),
      });
    }

    await this.prisma.userLogin.create({
      data: {
        userId: user.id,
        ip: context.ip,
        userAgent: context.req.headers['user-agent'] || 'Unknown',
        createdAt: new Date().toISOString(),
      },
    });

    return { user, refreshToken: newRefreshToken };
  }

  async generateSecureRefreshToken(user: any) {
    return this.jwtService.sign({ sub: user.id }, { expiresIn: '90d' });
  }
}
