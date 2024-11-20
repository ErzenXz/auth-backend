import {
  Injectable,
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
import { ChangePasswordDto } from './dtos/change.password.dto';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { UserLoginCommand } from './commands/user-login.command';
import { UserRegisterCommand } from './commands/user-register.command';
import { GetUserInfoQuery } from './queries/get-user-info.query';
import { UserRefreshTokenCommand } from './commands/user-refresh-token.command';
import { UserLogoutCommand } from './commands/user-logout.command';
import { PrivacyService } from 'src/privacy/privacy.service';
import { Request } from 'express';
import { ArpResponse } from './models/arp.model';
const crypto = require('crypto');

/**
 * Service for handling authentication-related operations.
 *
 * This service provides methods for user registration, login, password management,
 * multi-factor authentication (MFA), and session management. It integrates with
 * various services and utilizes command and query buses for handling operations.
 */
@Injectable()
export class AuthService {
  private readonly mfaService: MfaService;

  /**
   * Constructs the AuthService with necessary dependencies.
   *
   * @param commandBus - The command bus for executing commands.
   * @param queryBus - The query bus for executing queries.
   * @param prisma - The Prisma service for database interactions.
   * @param jwtService - The JWT service for token management.
   * @param mfaService - The service for managing multi-factor authentication.
   * @param eventEmitter - The event emitter for handling events.
   * @param privacySettingsService - The service for managing privacy settings.
   */
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    mfaService: MfaService,
    private readonly eventEmitter: EventEmitter2,
    private privacySettingsService: PrivacyService,
  ) {
    this.mfaService = mfaService;
  }

  /**
   * Registers a new user.
   *
   * @param registerRequest - The registration data for the new user.
   * @param context - The HTTP context containing user information.
   * @returns The result of the registration process.
   */
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

  /**
   * Logs in a user and generates access and refresh tokens.
   *
   * @param loginRequest - The login credentials for the user.
   * @param context - The HTTP context containing user information.
   * @returns An object containing the login message and tokens.
   */
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
      // Check if the user has logged in with this IP before
      const twoWeeksAgo = new Date(
        Date.now() - 14 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const userLogins = await this.prisma.userLogin.findMany({
        where: {
          userId: user.id,
          ip: context.ip,
          createdAt: {
            gte: twoWeeksAgo,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (userLogins.length <= 1) {
        return {
          message: 'MFA is required',
          code: 1000,
        };
      } else {
        this.saveCookie(context, 'refreshToken', refreshToken, {
          expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        });

        await this.privacySettingsService.initializeDefaultSettings(user.id);

        return {
          message: 'User logged in successfully!',
          accessToken: accessToken,
          refreshToken: refreshToken,
        };
      }
    } else {
      this.saveCookie(context, 'refreshToken', refreshToken, {
        expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      });

      await this.privacySettingsService.initializeDefaultSettings(user.id);

      return {
        message: 'User logged in successfully!',
        accessToken: accessToken,
        refreshToken: refreshToken,
      };
    }
  }

  /**
   * Retrieves user information based on the refresh token.
   *
   * @param context - The HTTP context containing user information.
   * @returns The user's information.
   */
  async info(context: IHttpContext) {
    const refreshToken = context.req.cookies['refreshToken'];
    return this.queryBus.execute(new GetUserInfoQuery(refreshToken));
  }

  /**
   * Refreshes the user's authentication session using the refresh token.
   *
   * @param context - The HTTP context containing user information.
   * @returns The result of the refresh process.
   */
  async refresh(context: IHttpContext) {
    const refreshToken = context.req.cookies['refreshToken'];
    return this.commandBus.execute(new UserRefreshTokenCommand(refreshToken));
  }

  /**
   * Logs out the user by invalidating the refresh token.
   *
   * @param context - The HTTP context containing user information.
   * @returns The result of the logout process.
   */
  async logout(context: IHttpContext) {
    const refreshToken = context.req.cookies['refreshToken'];
    return this.commandBus.execute(new UserLogoutCommand(refreshToken));
  }

  /**
   * Revokes a specified refresh token for the user.
   *
   * @param context - The HTTP context containing user information.
   * @param token - The refresh token to revoke.
   * @returns A message indicating the revocation status.
   * @throws UnauthorizedException if the token is invalid.
   */
  async revokeToken(context: IHttpContext, token: string) {
    const refreshToken = await this.prisma.refreshToken.findFirst({
      where: { token, userId: context.user.id, revoked: null },
    });

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid token');
    }

    await this.prisma.refreshToken.update({
      where: { id: refreshToken.id },
      data: {
        revoked: new Date().toISOString(),
        revocationReason: 'Token revoked by user',
      },
    });

    await this.prisma.userEvents.create({
      data: {
        userId: refreshToken.userId,
        eventType: 'auth.token.revoke',
        data: JSON.stringify({
          token: refreshToken.token,
          createdAt: new Date().toISOString(),
        }),
      },
    });

    return {
      message: 'Token revoked successfully!',
    };
  }

  /**
   * Generates a QR code for setting up multi-factor authentication (MFA).
   *
   * @param context - The HTTP context containing user information.
   * @returns The QR code image for MFA setup.
   * @throws UnauthorizedException if the refresh token is invalid.
   * @throws BadRequestException if MFA is already enabled.
   */
  async generateQrCode(context: IHttpContext) {
    const refreshToken = context.req.cookies['refreshToken'];
    const userAgent = context.req.headers['user-agent'];

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        expires: { gte: new Date().toISOString() },
        revoked: null,
        userAgent: userAgent,
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

    if (user.isTwoFactorEnabled) {
      throw new BadRequestException('MFA is already enabled');
    }

    console.log('Generating QR code');
    const secret = this.mfaService.generateTotpSecret();

    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: secret },
    });

    const otpQrCodeLink = this.mfaService.generateQrCodeUri(user.email, secret);
    const mfaQrCodeImage =
      await this.mfaService.generateQrCodeImage(otpQrCodeLink);

    context.res.setHeader('Content-Type', 'image/png');
    context.res.send(mfaQrCodeImage);
  }

  /**
   * Verifies the MFA code provided by the user.
   *
   * @param context - The HTTP context containing user information.
   * @param data - The MFA verification data containing the code.
   * @returns A message indicating the verification status and backup codes if MFA is enabled.
   * @throws UnauthorizedException if the refresh token is invalid.
   * @throws BadRequestException if the verification code is invalid.
   */
  async verifyMfaCode(context: IHttpContext, data: { code: string }) {
    const { code } = data;
    const refreshToken = context.req.cookies['refreshToken'];
    const userAgent = context.req.headers['user-agent'];

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        expires: { gte: new Date().toISOString() },
        revoked: null,
        userAgent: userAgent,
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

  /**
   * Verifies the MFA code during login.
   *
   * @param mfaRequest - The MFA request containing email, password, and code.
   * @param context - The HTTP context containing user information.
   * @returns An object containing the verification status and tokens.
   * @throws UnauthorizedException if the credentials are invalid.
   * @throws BadRequestException if MFA is not set up or the code is invalid.
   */
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

    let usedBackupCode = false;
    // If the user has logged in with this IP before, we don't need to check the MFA code
    let isValid = this.mfaService.verifyTotp(code, user.totpSecret);

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
        expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        tokenVersion: user.tokenVersion,
        created: new Date().toISOString(),
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

    this.saveCookie(context, 'refreshToken', newRefreshToken, {
      expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    });

    return {
      message: 'MFA verified successfully',
      code: 1000,
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Generates new backup codes for the user.
   *
   * @param context - The HTTP context containing user information.
   * @returns An object containing the new backup codes.
   * @throws UnauthorizedException if the refresh token is invalid.
   * @throws BadRequestException if MFA is not enabled.
   */
  async generateNewBackupCodes(context: IHttpContext) {
    const refreshToken = context.req.cookies['refreshToken'];
    const userAgent = context.req.headers['user-agent'];

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        expires: { gte: new Date().toISOString() },
        revoked: null,
        userAgent: userAgent,
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

  /**
   * Generates a secure refresh token for the user.
   *
   * @param user - The user for whom the refresh token is generated.
   * @returns The generated refresh token.
   */
  async generateSecureRefreshToken(user: any) {
    const refreshToken = this.jwtService.sign(
      { sub: user.id },
      { expiresIn: '90d' },
    );

    return refreshToken;
  }

  /**
   * Initiates the password reset process for the user.
   *
   * @param forgotDto - The data required to reset the password.
   * @returns A message indicating the status of the password reset email.
   */
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
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
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

  /**
   * Resets the user's password using a valid reset token.
   *
   * @param context - The HTTP context containing the reset token.
   * @returns A message indicating the status of the password reset.
   * @throws BadRequestException if the token is invalid or expired.
   */
  async resetPassword(context: IHttpContext) {
    const { token } = context.req.params;

    const resetToken = await this.prisma.emailPasswordReset.findFirst({
      where: {
        token,
        used: false,
        expiresAt: { gte: new Date().toISOString() },
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

    this.eventEmitter.emit('auth.forgot.reset', {
      email: user.email,
      name: user.fullName,
      password: randomSecurePassword,
    });

    return {
      message: 'Password reset successfully',
    };
  }

  /**
   * Changes the user's password.
   *
   * @param context - The HTTP context containing user information.
   * @param changePasswordDto - The data required to change the password.
   * @returns A message indicating the status of the password change.
   * @throws UnauthorizedException if the old password is invalid.
   */
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

    const newRefreshToken = await this.generateSecureRefreshToken(user);

    // Create refresh token in database
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: newRefreshToken,
        expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        tokenVersion: user.tokenVersion + 1,
        created: new Date().toISOString(),
        createdByIp: context.ip,
        userAgent: context.req.headers['user-agent'] || 'Unknown',
        deviceName: 'Unknown',
      },
    });

    // Set cookie
    this.saveCookie(context, 'refreshToken', newRefreshToken, {
      expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
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

  /**
   * Finds the user associated with the current context.
   *
   * @param context - The HTTP context containing user information.
   * @returns The user object.
   * @throws UnauthorizedException if the refresh token is invalid.
   */
  async findUser(context: IHttpContext) {
    const refreshToken = context.req.cookies['refreshToken'];

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        expires: { gte: new Date().toISOString() },
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

  /**
   * Checks the status of the user's session.
   *
   * @param req - The HTTP request object.
   * @returns An object indicating the session status.
   */
  async getUserSessionStatus(req: Request): Promise<ArpResponse> {
    const refreshToken = req.cookies['refreshToken'];

    if (!refreshToken) {
      return {
        expires: new Date().toISOString(),
        valid: false,
      };
    }

    const token = await this.prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        expires: { gte: new Date().toISOString() },
        revoked: null,
      },
    });

    if (!token) {
      return {
        expires: new Date().toISOString(),
        valid: false,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: token.userId },
    });

    if (!user) {
      return {
        expires: new Date().toISOString(),
        valid: false,
      };
    }

    if (user.tokenVersion !== token.tokenVersion) {
      return {
        expires: new Date().toISOString(),
        valid: false,
      };
    }

    return {
      expires: token.expires.toISOString(),
      valid: true,
    };
  }

  // USER MANAGEMENT

  /**
   * Retrieves all active sessions for the user.
   *
   * @param context - The HTTP context containing user information.
   * @returns An array of active refresh tokens for the user.
   * @throws UnauthorizedException if the user is not found.
   */
  async getAliveSessions(context: IHttpContext) {
    const user = await this.findUser(context);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return await this.prisma.refreshToken.findMany({
      where: {
        userId: user.id,
        expires: { gte: new Date().toISOString() },
        revoked: null,
        tokenVersion: user.tokenVersion,
      },
    });
  }

  /**
   * Retrieves the user's event history.
   *
   * @param context - The HTTP context containing user information.
   * @returns An array of user events.
   * @throws UnauthorizedException if the user is not found.
   */
  async getUserEvents(context: IHttpContext) {
    const user = await this.findUser(context);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return await this.prisma.userEvents.findMany({
      where: {
        userId: user.id,
      },
    });
  }

  /**
   * Disables multi-factor authentication (MFA) for the user.
   *
   * @param context - The HTTP context containing user information.
   * @returns A message indicating the status of MFA disablement.
   * @throws UnauthorizedException if the user is not found.
   */
  async disableMfa(context: IHttpContext) {
    const user = await this.findUser(context);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { isTwoFactorEnabled: false, totpSecret: null, backupCodes: null },
    });

    return {
      message: 'MFA disabled successfully',
    };
  }

  /**
   * Saves a cookie in the response.
   *
   * @param context - The HTTP context containing user information.
   * @param name - The name of the cookie.
   * @param value - The value of the cookie.
   * @param options - Additional options for the cookie.
   */
  saveCookie(
    context: IHttpContext,
    name: string,
    value: string,
    options: {
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: 'strict' | 'lax' | 'none';
      expires?: Date;
      maxAge?: number;
      domain?: string;
      path?: string;
      global?: boolean;
    } = {},
  ) {
    const {
      httpOnly = true,
      secure = true,
      sameSite = 'none',
      expires,
      maxAge,
      domain = process.env.COOKIE_DOMAIN,
      path = '/',
      global = false,
    } = options;

    const cookieOptions: any = {
      httpOnly,
      secure,
      sameSite,
      path,
    };

    if (expires) {
      cookieOptions.expires = expires;
    } else if (maxAge) {
      cookieOptions.maxAge = maxAge;
    }

    if (global) {
      // For global cookies, we'll set the domain to null
      // This allows the cookie to be accessible by any domain
      cookieOptions.domain = null;
    } else {
      cookieOptions.domain = domain;
    }

    context.res.cookie(name, value, cookieOptions);
    // Save cookies for .erzen.tk and .erzen.xyz
    context.res.cookie(name, value, { ...cookieOptions, domain: '.erzen.tk' });
    context.res.cookie(name, value, { ...cookieOptions, domain: '.erzen.xyz' });
    context.res.cookie(name, value, { ...cookieOptions, domain: 'localhost' });
  }
}
