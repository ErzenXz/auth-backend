import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-github2';
import { StrategiesEnum } from '../enums/security-strategies.enum';
import { ExternalUser } from '../models/external.user.model';

@Injectable()
export class GitHubStrategy extends PassportStrategy(
  Strategy,
  StrategiesEnum.GitHub,
) {
  constructor() {
    super({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: 'https://apis.erzen.tk/v1/external/oauth/github/redirect',
      scope: ['user:email'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    try {
      const { username, emails, photos } = profile;
      const user: ExternalUser = {
        externalId: profile.id,
        externalProvider: StrategiesEnum.GitHub,
        email: emails[0].value,
        firstName: username,
        lastName: '',
        fullName: username,
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
