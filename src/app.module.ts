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
import { seconds, ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { ChangeIPLocationHandler } from './auth/handlers/update-ip-location.handler';
import { EmailModule } from './email/email.module';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { PostHogModule } from './services/modules/posthog.module';
import { GraphQLModule } from '@nestjs/graphql';
import { join } from 'path';
import { ApolloDriver } from '@nestjs/apollo';
import { SampleResolver } from './resolvers/sample.resolver';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { GqlThrottlerGuard } from './resolvers/guards/graphql.guard';

const CommandHandlers = [ChangeIPLocationHandler];
const GraphQLResolvers = [SampleResolver];
@Module({
  imports: [
    DevtoolsModule.register({
      http: process.env.ENVIRONMENT !== 'production',
    }),
    WinstonModule.forRoot(winstonConfig),
    PostHogModule,
    EmailModule,
    AuthModule,
    UserModule,
    CollectionModule,
    PhotoModule,
    VideoModule,
    LocationModule,
    PrismaModule,
    StorageModule,
    PrivacyModule,
    MessagingModule,
    CustomEventEmitterModule,
    IntelligenceModule,
    CommandControlModule,
    ThrottlerModule.forRoot({
      throttlers: [{ limit: 25, ttl: seconds(60), blockDuration: seconds(60) }],
      storage: new ThrottlerStorageRedisService(
        new Redis({
          host: process.env.REDIS_URL,
          port: parseInt(process.env.REDIS_PORT, 10) || 6379,
          username: process.env.REDIS_USER || 'default',
          password: process.env.REDIS_PASSWORD,
        }),
      ),
    }),
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
    GraphQLModule.forRoot({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), 'src/schema.gql'),
      playground: false,
      introspection: true,
      plugins: [ApolloServerPluginLandingPageLocalDefault()],
      context: ({ req }) => ({ req }),
    }),
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
      useClass: GqlThrottlerGuard,
    },
    winston.Logger,
    ...CommandHandlers,
    ...GraphQLResolvers,
  ],
})
export class AppModule {
  constructor() {
    const logger = winston.createLogger(winstonConfig);
    winston.loggers.add('default', logger);
  }
}
