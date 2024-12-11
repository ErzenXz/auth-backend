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
import { BullModule } from '@nestjs/bullmq';
import { DevtoolsModule } from '@nestjs/devtools-integration';
import { IntelligenceModule } from './intelligence/intelligence.module';
import { CommandControlModule } from './services/command-control/command-control.module';

@Module({
  imports: [
    DevtoolsModule.register({
      http: process.env.NODE_ENV !== 'production',
    }),
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
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_URL,
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        username: process.env.REDIS_USER || 'default',
        password: process.env.REDIS_PASSWORD,
      },
    }),
    StorageModule,
    PrivacyModule,
    MessagingModule,
    CustomEventEmitterModule,
    IntelligenceModule,
    CommandControlModule,
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
