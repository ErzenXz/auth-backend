import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { CollectionModule } from './collection/collection.module';
import { PhotoModule } from './photo/photo.module';
import { VideoModule } from './video/video.module';
import { LocationModule } from './location/location.module';
import { PrismaModule } from './prisma/prisma.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { StorageModule } from './storage/storage.module';
import { AllExceptionsFilter } from './exception.filters';
import * as winston from 'winston';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './winston.config';
import { PrivacyModule } from './privacy/privacy.module';
import { MessagingModule } from './messaging/messaging.module';
import { CustomEventEmitterModule } from './services/event-emitter.module';

@Module({
  imports: [
    WinstonModule.forRoot(winstonConfig),
    AuthModule,
    UserModule,
    CollectionModule,
    PhotoModule,
    VideoModule,
    LocationModule,
    PrismaModule,
    CustomEventEmitterModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 30,
        blockDuration: 60,
      },
    ]),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    StorageModule,
    PrivacyModule,
    MessagingModule,
    CustomEventEmitterModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    winston.Logger,
  ],
})
export class AppModule {
  constructor() {
    const logger = winston.createLogger(winstonConfig);
    winston.loggers.add('default', logger);
  }
}
