import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtSecurity } from './security';
import { RolesGuard } from './guards/roles.security.jwt';
import { MfaService } from 'src/auth/mfa.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OAuthProviderController } from 'src/auth/oauth.controller';
import { OAuthProviderService } from 'src/auth/app.oauth.service';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { CqrsModule } from '@nestjs/cqrs';
import {
  ChangeBirthdateHandler,
  ChangeFullNameHandler,
  ChangeProfilePictureHandler,
} from './handlers';
import { UserLoginHandler } from './handlers/user-login.handler';
import { GetUserInfoHandler } from './handlers/get-user-info.handler';
import { UserRegisterHandler } from './handlers/user-register.handler';
import { UserRefreshTokenHandler } from './handlers/user-refresh-token.handler';
import { UserLogoutHandler } from './handlers/user-logout.handler';
import { PrivacyService } from 'src/privacy/privacy.service';
import { ChangeIPLocationHandler } from './handlers/update-ip-location.handler';

const CommandHandlers = [
  ChangeFullNameHandler,
  ChangeBirthdateHandler,
  ChangeProfilePictureHandler,
  UserLoginHandler,
  UserRegisterHandler,
  UserRefreshTokenHandler,
  UserLogoutHandler,
  ChangeIPLocationHandler,
];

const QueryHandlers = [GetUserInfoHandler];

@Module({
  imports: [
    PrismaModule,
    CqrsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '10m',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, OAuthProviderController, UserController],
  providers: [
    AuthService,
    JwtSecurity,
    RolesGuard,
    MfaService,
    OAuthProviderService,
    UserService,
    PrivacyService,
    ...CommandHandlers,
    ...QueryHandlers,
  ],
  exports: [AuthService],
})
export class AuthModule {}
