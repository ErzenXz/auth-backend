import { Module } from '@nestjs/common';
import { BrowserController } from './browser.controller';
import { BrowserService } from './browser.service';
import { ConfigModule } from '@nestjs/config';
import { XCacheModule } from 'src/cache/cache.module';
import { NewsModule } from './news/news.module';

@Module({
  imports: [ConfigModule, XCacheModule, NewsModule],
  controllers: [BrowserController],
  providers: [BrowserService],
})
export class BrowserModule {}
