import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-facebook';
import { AuthService } from '../auth.service';
import { StrategiesEnum } from '../enums/security-strategies.enum';
import { ExternalUser } from '../models/external.user.model';

@Injectable()
export class FacebookStrategy extends PassportStrategy(
  Strategy,
  StrategiesEnum.Facebook,
) {
  constructor(private authService: AuthService) {
    super({
      clientID: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
      callbackURL: 'https://apis.erzen.xyz/v1/external/oauth/facebook/redirect',
      profileFields: ['id', 'emails', 'name', 'photos'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    try {
      const { id, emails, name, photos } = profile;
      const user: ExternalUser = {
        externalId: id,
        externalProvider: StrategiesEnum.Facebook,
        email: 'fb@' + id + '.com',
        firstName: name.givenName || 'Facebook',
        lastName: name.familyName,
        fullName: `${name.givenName} ${name.familyName}`,
        picture: photos[0].value,
        accessToken,
        refreshToken,
      };
      done(null, user);
    } catch (error) {
      done(error, false);
    }
  }
}
