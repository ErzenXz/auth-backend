import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { instrument } from '@socket.io/admin-ui';
import { Redis } from 'ioredis';
import { ServerOptions } from 'socket.io';
import { createAdapter } from 'socket.io-redis';

export class RedisIoAdapter extends IoAdapter {
  private readonly pubClient: Redis;
  private readonly subClient: Redis;

  constructor(app: INestApplicationContext) {
    super(app);

    this.pubClient = new Redis({
      host: process.env.REDIS_URL,
      port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      username: process.env.REDIS_USER || 'default',
      password: process.env.REDIS_PASSWORD,
    });

    this.subClient = this.pubClient.duplicate();
  }

  createIOServer(port: number, options?: ServerOptions): any {
    const server = super.createIOServer(port, options);

    const redisAdapter = createAdapter({
      pubClient: this.pubClient,
      subClient: this.subClient,
    });

    server.adapter(redisAdapter);

    instrument(server, {
      auth: {
        type: 'basic',
        username: process.env.SOCKET_ADMIN_USERNAME,
        password: process.env.SOCKET_ADMIN_PASSWORD,
      },
    });
    server.cors = {
      origin: ['https://admin.socket.io'],
      credentials: true,
    };

    return server;
  }
}
