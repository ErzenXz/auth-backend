import { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Redis } from 'ioredis';
import { ServerOptions } from 'socket.io';
import { createAdapter } from 'socket.io-redis';

export class RedisIoAdapter extends IoAdapter {
  private readonly pubClient: Redis;
  private readonly subClient: Redis;

  constructor(app: INestApplicationContext) {
    super(app);

    this.pubClient = new Redis({
      host: '34.154.211.57',
      port: 6379,
      username: 'default',
      password: 'pbc9jnykneyvd2au',
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
    return server;
  }
}
