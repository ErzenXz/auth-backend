import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ChangeBirthdateCommand } from '../commands/change-birthdate.command';
import { PrismaService } from 'src/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserLoginCommand } from '../commands/user-login.command';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { UserRegisterCommand } from '../commands/user-register.command';
import { PrivacyService } from 'src/privacy/privacy.service';

@CommandHandler(UserRegisterCommand)
export class UserRegisterHandler
  implements ICommandHandler<UserRegisterCommand>
{
  constructor(
    private prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private jwtService: JwtService,
    private privacySettingsService: PrivacyService,
  ) {}

  async execute(command: UserRegisterCommand) {
    const {
      email,
      password,
      name,
      username,
      birthdate,
      language,
      timezone,
      context,
    } = command;

    // Check if user already exists
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      throw new ConflictException('Email or username is already in use');
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        fullName: name,
        username,
        birthdate,
        language,
        timeZone: timezone,
      },
    });

    // Generate JWT token
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    // Generate a new refresh token
    const refreshToken = await this.generateSecureRefreshToken(user);

    // Create a new refresh token object
    const refreshTokenObj = {
      userId: user.id,
      token: refreshToken,
      expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      tokenVersion: user.tokenVersion,
      created: new Date().toUTCString(),
      createdByIp: context.ip,
      userAgent: context.req.headers['user-agent'] || 'Unknown',
      deviceName: 'Unknown',
    };

    // Save the refresh token to the database
    await this.prisma.refreshToken.create({
      data: refreshTokenObj,
    });

    await this.prisma.userLogin.create({
      data: {
        userId: user.id,
        ip: context.ip,
        userAgent: context.req.headers['user-agent'] || 'Unknown',
        createdAt: new Date().toUTCString(),
      },
    });

    let usrCopy = { ...user };
    delete usrCopy.password;
    delete usrCopy.totpSecret;
    delete usrCopy.tokenVersion;

    this.eventEmitter.emit('auth.register', {
      name: 'Erzen Krasniqi',
      email: 'njnana2017@gmail.com',
    });

    await this.privacySettingsService.initializeDefaultSettings(user.id);

    return { user: usrCopy, accessToken, refreshToken };
  }

  async generateSecureRefreshToken(user: any) {
    const refreshToken = this.jwtService.sign(
      { sub: user.id },
      { expiresIn: '90d' },
    );

    return refreshToken;
  }
}
