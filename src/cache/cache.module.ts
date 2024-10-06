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
            host: '77.237.244.202',
            port: 6379,
          },
          ttl: 60,
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
