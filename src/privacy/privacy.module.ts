import { Module } from '@nestjs/common';
import { PrivacyController } from './privacy.controller';
import { XCacheModule } from 'src/cache/cache.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PrivacyService } from './privacy.service';

@Module({
  imports: [XCacheModule, PrismaModule],
  controllers: [PrivacyController],
  providers: [PrivacyService],
})
export class PrivacyModule {}
