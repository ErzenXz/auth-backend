import { Module } from '@nestjs/common';
import { CacheModule, CacheStore } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';
import { XCacheService } from './cache.service';

@Module({
  imports: [
    CacheModule.registerAsync({
      useFactory: async () => {
        const store = await redisStore({
          socket: {
            host: process.env.REDIS_URL,
            port: parseInt(process.env.REDIS_PORT, 10) || 6379,
            timeout: 10000,
          },
          ttl: 600,
          username: process.env.REDIS_USER || 'default',
          password: process.env.REDIS_PASSWORD,
        });

        return {
          store: store as unknown as CacheStore,
        };
      },
    }),
  ],
  providers: [XCacheService],
  exports: [XCacheService],
})
export class XCacheModule {}
