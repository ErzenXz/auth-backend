import { Module } from '@nestjs/common';
import { PhotoService } from './photo.service';
import { PhotoController } from './photo.controller';
import { XCacheModule } from 'src/cache/cache.module';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports: [XCacheModule, PrismaModule],
  providers: [PhotoService],
  controllers: [PhotoController],
})
export class PhotoModule {}
