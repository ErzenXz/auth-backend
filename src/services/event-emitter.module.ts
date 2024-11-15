// event-emitter.module.ts
import { Module } from '@nestjs/common';
import { EventEmitterModule, EventEmitter2 } from '@nestjs/event-emitter';
import Redis from 'ioredis';

@Module({
  imports: [
    EventEmitterModule.forRoot({
      global: true,
    }),
  ],
  providers: [
    {
      provide: EventEmitter2,
      useFactory: () => {
        const pubClient = new Redis({
          host: '34.154.211.57',
          port: 6379,
          username: 'default',
          password: 'pbc9jnykneyvd2au',
        });

        const subClient = pubClient.duplicate();

        const eventEmitter = new EventEmitter2();

        let isFromRedis = false;

        // Publish events to Redis only if not from Redis
        eventEmitter.onAny((event, value) => {
          if (!isFromRedis && typeof event === 'string') {
            pubClient.publish(event, JSON.stringify(value));
          }
        });

        // Subscribe to Redis events and emit locally without re-publishing
        subClient.on('message', (channel, message) => {
          isFromRedis = true;
          eventEmitter.emit(channel, JSON.parse(message));
          isFromRedis = false;
        });

        subClient.on('ready', () => {
          subClient.subscribe('message.sent');
          console.info(
            '[Redis Subscriber] Successfully subscribed to all channels',
          );
          console.info(
            '[GCM Node] Listening for control commands and messages',
          );
        });

        pubClient.on('connect', () =>
          console.info('[Redis Publisher] Connected to Redis'),
        );
        subClient.on('connect', () =>
          console.info('[Redis Subscriber] Connected to Redis'),
        );
        subClient.on('error', (err) =>
          console.error('[Redis Subscriber] Error:', err),
        );

        return eventEmitter;
      },
    },
  ],
  exports: [EventEmitter2],
})
export class CustomEventEmitterModule {}
