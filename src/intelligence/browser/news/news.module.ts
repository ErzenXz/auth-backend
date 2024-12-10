import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NewsService } from './news.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { NewsProcessor } from './news.processor';
import { NewsController } from './news.controller';
import { CommandControlModule } from 'src/services/command-control/command-control.module';

@Module({
  imports: [
    PrismaModule,
    CommandControlModule,
    BullModule.registerQueue({
      name: 'news-queue',
    }),
  ],
  providers: [NewsService, NewsProcessor],
  controllers: [NewsController],
  exports: [NewsService],
})
export class NewsModule {}
