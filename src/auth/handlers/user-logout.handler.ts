import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from 'src/prisma/prisma.service';
import { UnauthorizedException } from '@nestjs/common';
import { UserLogoutCommand } from '../commands/user-logout.command';

@CommandHandler(UserLogoutCommand)
export class UserLogoutHandler implements ICommandHandler<UserLogoutCommand> {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Handles the user logout process by revoking the refresh token.
   *
   * This method validates the provided refresh token, retrieves it from the database,
   * and marks it as revoked to ensure the user is securely logged out. If the token is
   * invalid or expired, an UnauthorizedException is thrown to prevent unauthorized access.
   *
   * @param {UserLogoutCommand} command - The command containing the refresh token for logout.
   * @param {string} command.refreshToken - The refresh token to be revoked.
   * @throws {UnauthorizedException} Throws an exception if the refresh token is invalid or expired.
   * @returns {Promise<{ message: string, code: number }>} A promise that resolves to an object containing a success message and a code.
   */
  async execute(command: UserLogoutCommand) {
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

    await this.prisma.refreshToken.update({
      where: { id: token.id },
      data: {
        revoked: new Date().toISOString(),
        revocationReason: 'User logged out',
      },
    });

    return {
      message: 'User logged out successfully!',
      code: 38,
    };
  }
}
