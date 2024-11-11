import { Module } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { XCacheModule } from 'src/cache/cache.module';
import { EncryptionService } from './encryption.service';
import { MessagingGateway } from './messaging.gateway';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    XCacheModule,
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
  providers: [MessagingService, EncryptionService, MessagingGateway],
  controllers: [MessagingController],
})
export class MessagingModule {}
