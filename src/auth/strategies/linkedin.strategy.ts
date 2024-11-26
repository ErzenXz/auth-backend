import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-linkedin-oauth2';
import { AuthService } from '../auth.service';
import { StrategiesEnum } from '../enums/security-strategies.enum';
import { ExternalUser } from '../models/external.user.model';

@Injectable()
export class LinkedInStrategy extends PassportStrategy(
  Strategy,
  StrategiesEnum.LinkedIn,
) {
  constructor() {
    super({
      clientID: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      callbackURL: 'https://apis.erzen.xyz/v1/external/oauth/linkedin/redirect',
      scope: ['profile', 'email'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
  ): Promise<ExternalUser> {
    try {
      const { id, displayName, emails, photos } = profile;
      const user: ExternalUser = {
        externalId: id,
        externalProvider: StrategiesEnum.LinkedIn,
        email: emails?.[0]?.value || '',
        firstName: displayName,
        lastName: '',
        fullName: displayName,
        picture: photos?.[0]?.value || '',
        accessToken,
        refreshToken,
      };
      return user;
    } catch (error) {
      throw error;
    }
  }
}
