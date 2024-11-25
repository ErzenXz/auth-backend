import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-discord';
import { AuthService } from '../auth.service';
import { StrategiesEnum } from '../enums/security-strategies.enum';
import { ExternalUser } from '../models/external.user.model';

@Injectable()
export class DiscordStrategy extends PassportStrategy(
  Strategy,
  StrategiesEnum.Discord,
) {
  constructor() {
    super({
      clientID: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      callbackURL: 'https://apis.erzen.xyz/v1/external/oauth/discord/redirect',
      scope: ['identify', 'email'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    try {
      const { id, username, email, avatar } = profile;
      const user: ExternalUser = {
        externalId: id,
        externalProvider: StrategiesEnum.Discord,
        email: email,
        firstName: username,
        lastName: '',
        fullName: username,
        picture: avatar
          ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png`
          : '',
        accessToken,
        refreshToken,
      };
      done(null, user);
    } catch (error) {
      done(error, false);
    }
  }
}
