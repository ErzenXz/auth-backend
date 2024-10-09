import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtSecurity } from './security';
import { RolesGuard } from './guards/roles.security.jwt';
import { MfaService } from 'src/auth/mfa.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OAuthProviderController } from 'src/oauth.controller';
import { OAuthProviderService } from 'src/app.oauth.service';

@Module({
  imports: [
    PrismaModule,
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
  controllers: [AuthController, OAuthProviderController],
  providers: [
    AuthService,
    JwtSecurity,
    RolesGuard,
    MfaService,
    OAuthProviderService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
