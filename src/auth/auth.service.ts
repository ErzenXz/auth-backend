import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'src/prisma/prisma.service';
import { ForgotPasswordDto, LoginDto, RegisterDto } from './dtos';
import type { HttpContext as IHttpContext } from './models/http.model';
import { MfaService } from 'src/auth/mfa.service';
import { MfaDto } from './dtos/mfa.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiAcceptedResponse } from '@nestjs/swagger';
import { ForgotPasswordDtoReset } from './dtos/forgot.verify.dto';
import { ChangePasswordDto } from './dtos/change.password.dto';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { UserLoginHandler } from './handlers/user-login.handler';
import { UserLoginCommand } from './commands/user-login.command';
import { UserRegisterCommand } from './commands/user-register.command';
import { GetUserInfoQuery } from './queries/get-user-info.query';
import { UserRefreshTokenCommand } from './commands/user-refresh-token.command';
import { UserLogoutCommand } from './commands/user-logout.command';
const crypto = require('crypto');

@Injectable()
export class AuthService {
  private mfaService: MfaService;

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private prisma: PrismaService,
    private jwtService: JwtService,
    mfaService: MfaService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.mfaService = mfaService;
  }

  async register(registerRequest: RegisterDto, context: IHttpContext) {
    const { email, password, name, username, birthdate, language, timezone } =
      registerRequest;

    return this.commandBus.execute(
      new UserRegisterCommand(
        email,
        password,
        name,
        username,
        birthdate,
        language,
        timezone,
        context,
      ),
    );
  }

  async login(loginRequest: LoginDto, context: IHttpContext) {
    const { email, password } = loginRequest;

    const { user, refreshToken } = await this.commandBus.execute(
      new UserLoginCommand(email, password, context),
    );

    // Generate JWT token
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    if (user.isTwoFactorEnabled) {
      return {
        message: 'MFA is required',
        code: 1000,
      };
    } else {
      context.res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        domain: process.env.COOKIE_DOMAIN,
      });

      return {
        message: 'User logged in successfully!',
        accessToken: accessToken,
        refreshToken: refreshToken,
      };
    }
  }

  async info(context: IHttpContext) {
    const refreshToken = context.req.cookies['refreshToken'];
    return this.queryBus.execute(new GetUserInfoQuery(refreshToken));
  }

  async refresh(context: IHttpContext) {
    const refreshToken = context.req.cookies['refreshToken'];
    return this.commandBus.execute(new UserRefreshTokenCommand(refreshToken));
  }

  async logout(context: IHttpContext) {
    const refreshToken = context.req.cookies['refreshToken'];
    return this.commandBus.execute(new UserLogoutCommand(refreshToken));
  }

  async revokeToken(token: string) {
    const refreshToken = await this.prisma.refreshToken.findFirst({
      where: { token },
    });

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid token');
    }

    await this.prisma.refreshToken.update({
      where: { id: refreshToken.id },
      data: { revoked: new Date(), revocationReason: 'Token revoked by user' },
    });

    await this.prisma.userEvents.create({
      data: {
        userId: refreshToken.userId,
        eventType: 'revoke',
        data: JSON.stringify({
          token: refreshToken.token,
          createdAt: new Date(),
        }),
      },
    });

    return {
      message: 'Token revoked successfully!',
      code: 38,
    };
  }

  async generateQrCode(context: IHttpContext) {
    const refreshToken = context.req.cookies['refreshToken'];
    const userAgent = context.req.headers['user-agent'];

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        expires: { gte: new Date() },
        revoked: null,
        userAgent: userAgent,
      },
    });

    if (!token) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: token.userId },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.isTwoFactorEnabled) {
      throw new BadRequestException('MFA is already enabled');
    }

    console.log('Generating QR code');
    const secret = this.mfaService.generateTotpSecret();

    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: secret },
    });

    const otpauth = this.mfaService.generateQrCodeUri(user.email, secret);
    const qrCodeImage = await this.mfaService.generateQrCodeImage(otpauth);

    context.res.setHeader('Content-Type', 'image/png');
    context.res.send(qrCodeImage);
  }

  async verifyMfaCode(context: IHttpContext, data: string | any) {
    const { code } = data;
    const refreshToken = context.req.cookies['refreshToken'];
    const userAgent = context.req.headers['user-agent'];

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        expires: { gte: new Date() },
        revoked: null,
        userAgent: userAgent,
      },
    });

    if (!token) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: token.userId },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!code) {
      throw new BadRequestException('Verification code is required');
    }

    console.log('Verifying code');
    const isValid = this.mfaService.verifyTotp(code, user.totpSecret);

    if (isValid) {
      const backupCodes = this.mfaService.generateBackupCodes();

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          backupCodes,
          isTwoFactorEnabled: true,
        },
      });

      await this.prisma.userEvents.create({
        data: {
          userId: user.id,
          eventType: 'mfa.enable',
          data: JSON.stringify({
            email: user.email,
            name: user.fullName,
            createdAt: user.createdAt,
          }),
        },
      });

      return {
        message: 'MFA enabled successfully',
        backupCodes: backupCodes.split(','),
      };
    } else {
      throw new BadRequestException('Invalid code');
    }
  }

  async verifyMfa(mfaRequest: MfaDto, context: IHttpContext) {
    const { email, password, code } = mfaRequest;

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

    if (!user.totpSecret) {
      throw new BadRequestException('MFA is not set up');
    }

    let isValid = this.mfaService.verifyTotp(code, user.totpSecret);
    let usedBackupCode = false;

    if (!isValid) {
      // Check backup codes
      const backupCodes = user.backupCodes?.split(',') || [];
      if (backupCodes.includes(code)) {
        isValid = true;
        usedBackupCode = true;

        // Remove used backup code
        const newBackupCodes = backupCodes.filter((c) => c !== code).join(',');

        await this.prisma.user.update({
          where: { id: user.id },
          data: { backupCodes: newBackupCodes },
        });
      }
    }

    if (!isValid) {
      throw new BadRequestException('Invalid code');
    }

    // Generate new tokens
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    const newRefreshToken = await this.generateSecureRefreshToken(user);

    // Create refresh token in database
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: newRefreshToken,
        expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        tokenVersion: user.tokenVersion,
        created: new Date(),
        createdByIp: context.ip,
        userAgent: context.req.headers['user-agent'] || 'Unknown',
        deviceName: 'Unknown',
      },
    });

    await this.prisma.userEvents.create({
      data: {
        userId: user.id,
        eventType: 'mfa.login',
        data: JSON.stringify({
          email: user.email,
          name: user.fullName,
          createdAt: user.createdAt,
          usedBackupCode,
        }),
      },
    });

    context.res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      domain: process.env.COOKIE_DOMAIN,
    });

    return {
      message: 'MFA verified successfully',
      code: 1000,
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async generateNewBackupCodes(context: IHttpContext) {
    const refreshToken = context.req.cookies['refreshToken'];
    const userAgent = context.req.headers['user-agent'];

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        expires: { gte: new Date() },
        revoked: null,
        userAgent: userAgent,
      },
    });

    if (!token) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: token.userId },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isTwoFactorEnabled) {
      throw new BadRequestException('MFA is not enabled');
    }

    const backupCodes = this.mfaService.generateBackupCodes();

    await this.prisma.user.update({
      where: { id: user.id },
      data: { backupCodes },
    });

    return {
      message: 'Backup codes generated successfully',
      code: 1000,
      backupCodes: backupCodes.split(','),
    };
  }

  async generateSecureRefreshToken(user: any) {
    const refreshToken = this.jwtService.sign(
      { sub: user.id },
      { expiresIn: '90d' },
    );

    return refreshToken;
  }

  async forgotPassword(forgotDto: ForgotPasswordDto) {
    const { email } = forgotDto;
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const resetToken = this.jwtService.sign(
      { sub: user.id, use: 'resetPassword' },
      { expiresIn: '1h' },
    );

    // Save to prisma
    await this.prisma.emailPasswordReset.create({
      data: {
        email: user.email,
        token: resetToken,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    this.eventEmitter.emit('auth.forgot', {
      name: user.fullName,
      email: user.email,
      token: resetToken,
    });

    // Send email with reset token
    return {
      message: 'Password reset email sent successfully',
    };
  }

  async resetPassword(context: IHttpContext) {
    const token = context.req.params.token;

    const resetToken = await this.prisma.emailPasswordReset.findFirst({
      where: {
        token,
        used: false,
        expiresAt: { gte: new Date() },
      },
    });

    if (!resetToken) {
      throw new BadRequestException('Invalid token');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: resetToken.email },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const randomSecurePassword = crypto.randomBytes(16).toString('hex');

    const hashedPassword = await bcrypt.hash(randomSecurePassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
      },
    });

    await this.prisma.emailPasswordReset.delete({
      where: { id: resetToken.id },
    });

    await this.prisma.userEvents.create({
      data: {
        userId: user.id,
        eventType: 'password.reset',
        data: JSON.stringify({
          email: user.email,
          name: user.fullName,
          createdAt: user.createdAt,
        }),
      },
    });

    return {
      message: 'Password reset successfully',
    };
  }

  async changePassword(
    context: IHttpContext,
    changePasswordDto: ChangePasswordDto,
  ) {
    const { oldPassword, newPassword } = changePasswordDto;

    const user = await this.findUser(context);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(oldPassword, user.password);

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid old password');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        tokenVersion: user.tokenVersion + 1,
      },
    });

    await this.prisma.userEvents.create({
      data: {
        userId: user.id,
        eventType: 'password.change',
        data: JSON.stringify({
          email: user.email,
          name: user.fullName,
          createdAt: user.createdAt,
        }),
      },
    });

    return {
      message: 'Password changed successfully',
    };
  }

  // Helper functions

  async findUser(context: IHttpContext) {
    const refreshToken = context.req.cookies['refreshToken'];

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        expires: { gte: new Date() },
        revoked: null,
        tokenVersion: context.user.tokenVersion,
      },
    });

    if (!token) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: token.userId },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  // USER MANAGEMENT

  async getAliveSessions(context: IHttpContext) {
    const user = await this.findUser(context);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const sessions = await this.prisma.refreshToken.findMany({
      where: {
        userId: user.id,
        expires: { gte: new Date() },
        revoked: null,
      },
    });

    return sessions;
  }

  async getUserEvents(context: IHttpContext) {
    const user = await this.findUser(context);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const events = await this.prisma.userEvents.findMany({
      where: {
        userId: user.id,
      },
    });

    return events;
  }
}
