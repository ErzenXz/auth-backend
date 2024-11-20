import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from 'src/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { UserRegisterCommand } from '../commands/user-register.command';
import { PrivacyService } from 'src/privacy/privacy.service';

/**
 * Command handler for user registration operations.
 *
 * This class implements the ICommandHandler interface to handle the execution of
 * the UserRegisterCommand. It validates user details, checks for existing accounts,
 * hashes the password, creates a new user in the database, generates JWT and refresh tokens,
 * and initializes default privacy settings. It throws a ConflictException if the email
 * or username is already in use.
 *
 * @param {PrismaService} prisma - The Prisma service instance used for database operations.
 * @param {EventEmitter2} eventEmitter - The event emitter instance used to publish events.
 * @param {JwtService} jwtService - The JWT service instance used for token generation.
 * @param {PrivacyService} privacySettingsService - The service instance for managing privacy settings.
 * @returns {Promise<{ user: Object, accessToken: string, refreshToken: string }>} A promise that resolves to an object containing the newly created user (without sensitive information), access token, and refresh token.
 * @throws {ConflictException} Throws an exception if the email or username is already in use.
 */
@CommandHandler(UserRegisterCommand)
export class UserRegisterHandler
  implements ICommandHandler<UserRegisterCommand>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly jwtService: JwtService,
    private readonly privacySettingsService: PrivacyService,
  ) {}

  /**
   * Executes the user registration process by creating a new user account.
   *
   * This method validates the provided user details, checks for existing users with the same email
   * or username, hashes the password, creates a new user in the database, generates JWT and refresh tokens,
   * and initializes default privacy settings. It throws a ConflictException if the email or username is already in use.
   *
   * @param {UserRegisterCommand} command - The command containing user registration details.
   * @param {string} command.email - The email address of the user.
   * @param {string} command.password - The password for the user account.
   * @param {string} command.name - The full name of the user.
   * @param {string} command.username - The desired username for the user.
   * @param {Date} command.birthdate - The birthdate of the user.
   * @param {string} command.language - The preferred language of the user.
   * @param {string} command.timezone - The timezone of the user.
   * @param {Object} command.context - The context object containing request metadata.
   * @param {string} command.context.ip - The IP address of the user making the request.
   * @param {Object} command.context.req - The request object containing headers.
   * @throws {ConflictException} Throws an exception if the email or username is already in use.
   * @returns {Promise<{ user: Object, accessToken: string, refreshToken: string }>} A promise that resolves to an object containing the newly created user (without sensitive information), access token, and refresh token.
   */
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
      created: new Date().toISOString(),
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
        createdAt: new Date().toISOString(),
      },
    });

    const usrCopy = { ...user };
    delete usrCopy.password;
    delete usrCopy.totpSecret;
    delete usrCopy.tokenVersion;

    this.eventEmitter.emit('auth.register', {
      name: user.fullName,
      email: user.email,
    });

    await this.privacySettingsService.initializeDefaultSettings(user.id);

    return { user: usrCopy, accessToken, refreshToken };
  }

  async generateSecureRefreshToken(user: any) {
    return this.jwtService.sign({ sub: user.id }, { expiresIn: '90d' });
  }
}
