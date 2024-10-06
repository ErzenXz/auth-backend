import { Module } from '@nestjs/common';
import { CollectionService } from './collection.service';
import { CollectionController } from './collection.controller';
import { XCacheModule } from 'src/cache/cache.module';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AppService } from 'src/app.service';

@Module({
  imports: [XCacheModule, PrismaModule],
  providers: [CollectionService, AppService],
  controllers: [CollectionController],
})
export class CollectionModule {}
