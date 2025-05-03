import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { instrument } from '@socket.io/admin-ui';
import { Redis } from 'ioredis';
import { ServerOptions } from 'socket.io';
import { createAdapter } from 'socket.io-redis';

export class RedisIoAdapter extends IoAdapter {
  private readonly pubClient: Redis;
  private readonly subClient: Redis;
  private readonly logger = new Logger('RedisIoAdapter');

  constructor(app: INestApplicationContext) {
    super(app);

    // Configuration for Redis - keep in sync with event-emitter.module.ts
    const redisConfig = {
      host: process.env.REDIS_URL,
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      username: process.env.REDIS_USER || 'default',
      password: process.env.REDIS_PASSWORD,
      // Explicitly set database to 0 to ensure consistency with other Redis clients
      db: 0,
      tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
      // Add retry strategy
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        this.logger.warn(
          `Redis connection attempt ${times}. Retrying in ${delay}ms...`,
        );
        return delay;
      },
    };

    this.logger.log(
      `Connecting to Redis at ${redisConfig.host}:${redisConfig.port}`,
    );

    this.pubClient = new Redis(redisConfig);
    this.subClient = this.pubClient.duplicate();

    this.pubClient.on('connect', () =>
      this.logger.log('[Redis Socket.IO Publisher] Connected to Redis'),
    );

    this.pubClient.on('error', (err) =>
      this.logger.error('[Redis Socket.IO Publisher] Error:', err),
    );

    this.subClient.on('connect', () =>
      this.logger.log('[Redis Socket.IO Subscriber] Connected to Redis'),
    );

    this.subClient.on('error', (err) =>
      this.logger.error('[Redis Socket.IO Subscriber] Error:', err),
    );
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);

    try {
      const redisAdapter = createAdapter({
        pubClient: this.pubClient,
        subClient: this.subClient,
      });

      server.adapter(redisAdapter);
      this.logger.log('Redis adapter configured for Socket.IO');

      // Allow more origins for CORS
      const allowedOrigins = [
        'https://admin.socket.io',
        // Add your frontend origins here
        ...(process.env.CORS_ORIGINS
          ? process.env.CORS_ORIGINS.split(',')
          : []),
      ];

      instrument(server, {
        auth: {
          type: 'basic',
          username: process.env.SOCKET_ADMIN_USERNAME,
          password: process.env.SOCKET_ADMIN_PASSWORD,
        },
      });

      server.cors = {
        origin: allowedOrigins,
        credentials: true,
      };

      this.logger.log(
        `Socket.IO CORS configured for origins: ${allowedOrigins.join(', ')}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to set up Redis adapter: ${error.message}`,
        error.stack,
      );
    }

    return server;
  }
}
