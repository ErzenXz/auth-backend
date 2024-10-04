import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtSecurity } from './security';
import { RolesGuard } from './guards/roles.security.jwt';
import { MfaService } from 'src/auth/mfa.service';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: '10m',
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtSecurity, RolesGuard, MfaService],
  exports: [AuthService],
})
export class AuthModule {}
