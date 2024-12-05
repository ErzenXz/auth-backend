import { Module } from '@nestjs/common';
import { BrowserController } from './browser.controller';
import { BrowserService } from './browser.service';
import { ConfigModule } from '@nestjs/config';
import { XCacheModule } from 'src/cache/cache.module';

@Module({
  imports: [ConfigModule, XCacheModule],
  controllers: [BrowserController],
  providers: [BrowserService],
})
export class BrowserModule {}
