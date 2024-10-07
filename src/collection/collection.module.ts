import { Module } from '@nestjs/common';
import { CollectionService } from './collection.service';
import { CollectionController } from './collection.controller';
import { XCacheModule } from 'src/cache/cache.module';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [XCacheModule, PrismaModule],
  providers: [CollectionService],
  controllers: [CollectionController],
})
export class CollectionModule {}
