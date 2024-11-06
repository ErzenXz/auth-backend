import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { GetUserInfoQuery } from '../queries/get-user-info.query';

@QueryHandler(GetUserInfoQuery)
export class GetUserInfoHandler implements IQueryHandler<GetUserInfoQuery> {
  constructor(private prisma: PrismaService) {}

  async execute(query: GetUserInfoQuery) {
    const { refreshToken } = query;

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

    if (user.tokenVersion !== token.tokenVersion) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      name: user.fullName,
      username: user.username,
      email: user.email,
      role: user.role,
      lastLogin: user.lastLogin,
      multifactorEnabled: user.isTwoFactorEnabled,
      emailVerified: user.isEmailVerified,
      externalUser: user.isExternal,
      birthdate: user.birthdate,
      language: user.language,
      timezone: user.timeZone,
      image: user.profilePicture,
    };
  }
}
