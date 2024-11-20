import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtSecurity extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  /**
   * Validates the user based on the provided JWT payload.
   *
   * This method checks if a user exists in the database by matching the user ID, email,
   * and role from the JWT payload. If the user is found, it returns the user object;
   * otherwise, it returns false, indicating validation failure.
   *
   * @param {any} payload - The JWT payload containing user identification information.
   * @param {string} payload.sub - The unique identifier of the user.
   * @param {string} payload.email - The email address of the user.
   * @param {string} payload.role - The role of the user.
   * @returns {Promise<User | false>} A promise that resolves to the user object if found, or false if validation fails.
   */
  async validate(payload: any) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      },
    });

    if (!user) {
      return false;
    }

    return user;
  }
}
