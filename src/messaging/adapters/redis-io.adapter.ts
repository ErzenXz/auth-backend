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
      host: 'redis-17198.c328.europe-west3-1.gce.redns.redis-cloud.com',
      port: 17198,
      username: 'default',
      password: 'ifW4WlzrmePojpRz5i72aBsfj8o9yaAY',
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
