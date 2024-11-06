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
            host: 'redis-17198.c328.europe-west3-1.gce.redns.redis-cloud.com',
            port: 17198,
            timeout: 10000,
          },
          ttl: 60,
          // password: 'mySuperDuperSECUREPASSWORD',
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
