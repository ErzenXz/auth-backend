import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from 'src/prisma/prisma.service';
import { UserRefreshTokenCommand } from '../commands/user-refresh-token.command';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PostHogService } from 'src/services/posthog.service';

@CommandHandler(UserRefreshTokenCommand)
export class UserRefreshTokenHandler
  implements ICommandHandler<UserRefreshTokenCommand>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly postHogService: PostHogService,
  ) {}

  /**
   * Executes the process of refreshing a user's access token using a valid refresh token.
   *
   * This method validates the provided refresh token, retrieves the associated user,
   * updates the last used date of the refresh token, and generates a new JWT access token
   * for the user. It throws an UnauthorizedException if the refresh token is invalid, expired,
   * or if the user cannot be found.
   *
   * @param {UserRefreshTokenCommand} command - The command containing the refresh token for generating a new access token.
   * @param {string} command.refreshToken - The refresh token to be validated and used for generating a new access token.
   * @throws {UnauthorizedException} Throws an exception if the refresh token is invalid, expired, or if the user does not exist.
   * @returns {Promise<{ accessToken: string }>} A promise that resolves to an object containing the newly generated access token.
   */
  async execute(command: UserRefreshTokenCommand) {
    const { refreshToken } = command;

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        expires: { gte: new Date().toISOString() },
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

    // Update the refresh token last used date

    await this.prisma.refreshToken.update({
      where: { id: token.id },
      data: { lastUsed: new Date().toISOString() },
    });

    // Generate JWT token
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    this.postHogService.captureEvent(user.id, 'user_refresh_token');

    return {
      accessToken,
    };
  }
}
