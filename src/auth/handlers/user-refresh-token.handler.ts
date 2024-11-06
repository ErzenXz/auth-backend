import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ChangeProfilePictureCommand } from '../commands/change-profile-picture.command';
import { PrismaService } from 'src/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserRefreshTokenCommand } from '../commands/user-refresh-token.command';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@CommandHandler(UserRefreshTokenCommand)
export class UserRefreshTokenHandler
  implements ICommandHandler<UserRefreshTokenCommand>
{
  constructor(
    private prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private jwtService: JwtService,
  ) {}

  async execute(command: UserRefreshTokenCommand) {
    const { refreshToken } = command;

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        expires: { gte: new Date().toUTCString() },
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
      data: { lastUsed: new Date().toUTCString() },
    });

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
}
