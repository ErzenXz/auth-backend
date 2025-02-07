import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { GetUserInfoQuery } from '../queries/get-user-info.query';
import { PostHogService } from 'src/services/posthog.service';

@QueryHandler(GetUserInfoQuery)
export class GetUserInfoHandler implements IQueryHandler<GetUserInfoQuery> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly postHogService: PostHogService,
  ) {}

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

    const tokenWithUser = await this.prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        expires: { gte: new Date().toISOString() },
        revoked: null,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            email: true,
            role: true,
            lastLogin: true,
            isTwoFactorEnabled: true,
            isEmailVerified: true,
            isExternal: true,
            birthdate: true,
            language: true,
            timeZone: true,
            profilePicture: true,
            tokenVersion: true,
          },
        },
      },
    });

    if (!tokenWithUser || !tokenWithUser.user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { user } = tokenWithUser;

    if (user.tokenVersion !== tokenWithUser.tokenVersion) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.postHogService.captureEvent(user.id, 'user_info_retrieved');

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
