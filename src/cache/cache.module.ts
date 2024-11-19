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
            host: '34.154.211.57',
            port: 6379,
            timeout: 10000,
          },
          ttl: 60,
          username: 'default',
          password: 'pbc9jnykneyvd2au',
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
