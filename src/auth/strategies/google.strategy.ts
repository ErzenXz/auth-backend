import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';
import { StrategiesEnum } from '../enums/security-strategies.enum';
import { ExternalUser } from '../models/external.user.model';
import { response } from 'express';

@Injectable()
export class GoogleStrategy extends PassportStrategy(
  Strategy,
  StrategiesEnum.Google,
) {
  constructor(private readonly authService: AuthService) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: 'https://apis.erzen.tk/v1/external/oauth/google/redirect',
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    try {
      const { name, emails, photos } = profile;
      const user: ExternalUser = {
        externalId: profile.id,
        externalProvider: StrategiesEnum.Google,
        email: emails[0].value,
        firstName: name.givenName,
        lastName: name.familyName,
        fullName: name.givenName + ' ' + name.familyName,
        picture: photos[0].value,
        accessToken,
        refreshToken,
      };
      done(null, user);
    } catch (error) {
      response.redirect(
        `https://auth.erzen.xyz/external?status=error?message=${error.message}`,
      );
      done(error, false);
    }
  }
}
