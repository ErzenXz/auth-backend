import { Module } from '@nestjs/common';
import { BrowserController } from './browser.controller';
import { BrowserService } from './browser.service';
import { ConfigModule } from '@nestjs/config';
import { XCacheModule } from 'src/cache/cache.module';
import { NewsModule } from './news/news.module';
import { OpenRouterProvider } from '../providers/OpenRouter.provider';
import { GoogleProvider } from '../providers/Gemini.provider';
import { LlamaProvider } from '../providers/Llama.provider';
import { OpenAiProvider } from '../providers/OpenAI.provider';
import { AiWrapperService } from '../providers/ai-wrapper.service';

const AIProviders = [
  GoogleProvider,
  OpenAiProvider,
  OpenRouterProvider,
  LlamaProvider,
];

@Module({
  imports: [ConfigModule, XCacheModule, NewsModule],
  controllers: [BrowserController],
  providers: [BrowserService, AiWrapperService, ...AIProviders],
})
export class BrowserModule {}
