import { Module } from '@nestjs/common';
import { IntelligenceService } from './intelligence.service';
import { IntelligenceController } from './intelligence.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { TextToSpeechModule } from './speech/speech.module';
import { BrowserModule } from './browser/browser.module';
import { BrowserService } from './browser/browser.service';
import { XCacheModule } from 'src/cache/cache.module';
import { AiWrapperService } from './providers/ai-wrapper.service';
import { GoogleProvider } from './providers/Gemini.provider';
import { OpenAiProvider } from './providers/OpenAI.provider';
import { DeepseekProvider } from './providers/Deepseek.provider';
import { LlamaProvider } from './providers/Llama.provider';

/**
 * IntelligenceModule is the main module for the intelligence feature.
 * It imports the necessary modules and declares the controllers and providers.
 */

const AIProviders = [
  GoogleProvider,
  OpenAiProvider,
  DeepseekProvider,
  LlamaProvider,
];
@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    TextToSpeechModule,
    BrowserModule,
    XCacheModule,
  ],
  controllers: [IntelligenceController],
  providers: [
    IntelligenceService,
    BrowserService,
    AiWrapperService,
    ...AIProviders,
  ],
})
export class IntelligenceModule {}
