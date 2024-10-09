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

@Injectable()
export class AuthService {
  private mfaService: MfaService;

  constructor(
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
      created: new Date(),
      createdByIp: context.ip,
      userAgent: context.req.headers['user-agent'] || 'Unknown',
      deviceName: 'Unknown',
    };

    // Save the refresh token to the database
    await this.prisma.refreshToken.create({
      data: refreshTokenObj,
    });

    let usrCopy = { ...user };
    delete usrCopy.password;
    delete usrCopy.totpSecret;
    delete usrCopy.tokenVersion;

    this.eventEmitter.emit('auth.register', {
      name: 'Erzen Krasniqi',
      email: 'njnana2017@gmail.com',
    });

    return {
      accessToken,
      refreshToken,
      user: usrCopy,
    };
  }

  async login(loginRequest: LoginDto, context: IHttpContext) {
    const { email, password } = loginRequest;
    const userAgent = context.req.headers['user-agent'] || 'Unknown';
    const ip = context.ip;

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

    const currentRefreshTokenVersion = user.tokenVersion;
    let newRefreshToken = await this.generateSecureRefreshToken(user);
    let found = false;

    // Check if any of the refresh tokens are still active
    for (const token of refreshTokens) {
      if (
        currentRefreshTokenVersion === token.tokenVersion &&
        token.expires > new Date() &&
        userAgent === token.userAgent &&
        token.revoked === null
      ) {
        await this.prisma.refreshToken.update({
          where: { id: token.id },
          data: { lastUsed: new Date() },
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
        expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        tokenVersion: user.tokenVersion,
        created: new Date(),
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
        lastLogin: new Date(),
        connectingIp: ip,
      },
    });

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
      context.res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        domain: process.env.COOKIE_DOMAIN,
      });

      return {
        message: 'User logged in successfully!',
        accessToken: accessToken,
        refreshToken: newRefreshToken,
      };
    }
  }

  async info(context: IHttpContext) {
    const refreshToken = context.req.cookies['refreshToken'];

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        expires: { gte: new Date() },
        revoked: null,
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

    let response = {
      name: user.fullName,
      email: user.email,
      role: user.role,
      lastLogin: user.lastLogin,
      multifactorEnabled: user.isTwoFactorEnabled,
      emailVerified: user.isEmailVerified,
      externalUser: user.isExternal,
      birthdate: user.birthdate,
    };

    return response;
  }

  async refresh(context: IHttpContext) {
    const refreshToken = context.req.cookies['refreshToken'];

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        expires: { gte: new Date() },
        revoked: null,
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

    // Generate JWT token
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
    };
  }

  async logout(context: IHttpContext) {
    const refreshToken = context.req.cookies['refreshToken'];

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        expires: { gte: new Date() },
        revoked: null,
      },
    });

    if (!token) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.refreshToken.update({
      where: { id: token.id },
      data: { revoked: new Date(), revocationReason: 'User logged out' },
    });

    return {
      message: 'User logged out successfully!',
      code: 38,
    };
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

    return {
      message: 'Token revoked successfully!',
      code: 38,
    };
  }

  async setupMfa(context: IHttpContext, data: string | any) {
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

    if (user.isTwoFactorEnabled) {
      throw new BadRequestException('MFA is already enabled');
    }

    if (!user.isTwoFactorEnabled && (!code || code === 'first')) {
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
      return;
    } else {
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

        return {
          message: 'MFA enabled successfully',
          backupCodes: backupCodes.split(','),
        };
      } else {
        throw new BadRequestException('Invalid code');
      }
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

    // Send email with reset token
    return {
      message: 'Reset token sent successfully',
      resetToken,
    };
  }
}
