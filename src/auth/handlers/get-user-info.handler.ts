import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { GetUserInfoQuery } from '../queries/get-user-info.query';

@QueryHandler(GetUserInfoQuery)
export class GetUserInfoHandler implements IQueryHandler<GetUserInfoQuery> {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves user information based on a valid refresh token.
   *
   * This method validates the provided refresh token, checks its expiration and revocation status,
   * and retrieves the associated user details from the database. It throws an UnauthorizedException
   * if the token is invalid, expired, or if the user does not exist or has an invalid token version.
   *
   * @param {GetUserInfoQuery} query - The query containing the refresh token for user information retrieval.
   * @param {string} query.refreshToken - The refresh token used to authenticate the user and fetch their information.
   * @throws {UnauthorizedException} Throws an exception if the refresh token is invalid, expired, or if the user does not exist.
   * @returns {Promise<{ id: string, name: string, username: string, email: string, role: string, lastLogin: string, multifactorEnabled: boolean, emailVerified: boolean, externalUser: boolean, birthdate: string, language: string, timezone: string, image: string }>} A promise that resolves to an object containing the user's information.
   */
  async execute(query: GetUserInfoQuery) {
    const { refreshToken } = query;

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

    if (user.tokenVersion !== token.tokenVersion) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      id: user.id,
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
