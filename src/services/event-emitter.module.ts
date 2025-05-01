// event-emitter.module.ts
import { Module, Logger, Global } from '@nestjs/common';
import { EventEmitterModule, EventEmitter2 } from '@nestjs/event-emitter';
import Redis from 'ioredis';

@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      global: true,
      wildcard: true,
      delimiter: '.',
    }),
  ],
  providers: [
    {
      provide: EventEmitter2,
      useFactory: () => {
        const logger = new Logger('EventEmitter2Redis');

        const redisConfig = {
          host: process.env.REDIS_URL,
          port: parseInt(process.env.REDIS_PORT, 10) || 6379,
          username: process.env.REDIS_USER || 'default',
          password: process.env.REDIS_PASSWORD,
          db: 0,
          retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            logger.warn(
              `Redis connection attempt ${times}. Retrying in ${delay}ms...`,
            );
            return delay;
          },
        };

        logger.log(
          `Connecting to Redis at ${redisConfig.host}:${redisConfig.port}`,
        );

        const pubClient = new Redis(redisConfig);
        const subClient = pubClient.duplicate();

        const eventEmitter = new EventEmitter2({
          wildcard: true,
          delimiter: '.',
        });

        const globalEvents = [
          'message.sent',
          'auth.new-ip-login',
          'auth.forgot',
          'auth.forgot.reset',
          'auth.register',
          'user.birthdate',
          'user.name',
          'user.photo',
          'group.message.sent',
          'group.created',
          'group.members.added',
          'call.initiated',
          'call.participant.joined',
          'call.participant.left',
        ];

        let isFromRedis = false;

        eventEmitter.onAny((event, value) => {
          if (!isFromRedis && typeof event === 'string') {
            logger.log(`Publishing event ${event} to Redis`);
            pubClient.publish(event, JSON.stringify(value));
          }
        });

        subClient.on('message', (channel, message) => {
          logger.log(`Received ${channel} event from Redis`);
          try {
            isFromRedis = true;
            eventEmitter.emit(channel, JSON.parse(message));
            isFromRedis = false;
          } catch (error) {
            logger.error(
              `Error handling Redis message: ${error.message}`,
              error.stack,
            );
            isFromRedis = false;
          }
        });

        subClient.on('ready', () => {
          globalEvents.forEach((event) => {
            subClient.subscribe(event, (err, count) => {
              if (err) {
                logger.error(`Failed to subscribe to ${event}: ${err.message}`);
              } else {
                logger.log(`Subscribed to ${event} (total: ${count})`);
              }
            });
          });

          logger.log(
            `[Redis Subscriber] Successfully subscribed to channels: ${globalEvents.join(', ')}`,
          );
        });

        pubClient.on('connect', () =>
          logger.log('[Redis Publisher] Connected to Redis'),
        );

        pubClient.on('error', (err) =>
          logger.error('[Redis Publisher] Error:', err),
        );

        subClient.on('connect', () =>
          logger.log('[Redis Subscriber] Connected to Redis'),
        );

        subClient.on('error', (err) =>
          logger.error('[Redis Subscriber] Error:', err),
        );

        return eventEmitter;
      },
    },
  ],
  exports: [EventEmitter2],
})
export class CustomEventEmitterModule {}
