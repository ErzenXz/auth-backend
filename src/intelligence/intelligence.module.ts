import { Module } from '@nestjs/common';
import { IntelligenceService } from './intelligence.service';
import { IntelligenceController } from './intelligence.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TextToSpeechModule } from './speech/speech.module';
import { BrowserModule } from './browser/browser.module';
import { BrowserService } from './browser/browser.service';
import { XCacheModule } from 'src/cache/cache.module';
import { AiWrapperService } from './providers/ai-wrapper.service';
import { GoogleProvider } from './providers/Gemini.provider';
import { OpenAiProvider } from './providers/OpenAI.provider';
import { OpenRouterProvider } from './providers/OpenRouter.provider';
import { LlamaProvider } from './providers/Llama.provider';
import { IntelligenceGateway } from './intelligence.gateway';
import { JwtModule } from '@nestjs/jwt';
import { GroqProvider } from './providers/Groq.provider';
import { CrawlerService } from './browser/crawler.service';
import { AnthropicProvider } from './providers/Anthropic.provider';

/**
 * IntelligenceModule is the main module for the intelligence feature.
 * It imports the necessary modules and declares the controllers and providers.
 */

const AIProviders = [
  GoogleProvider,
  OpenAiProvider,
  OpenRouterProvider,
  LlamaProvider,
  GroqProvider,
  AnthropicProvider,
];

const Services = [BrowserService, AiWrapperService, CrawlerService];
@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    TextToSpeechModule,
    BrowserModule,
    XCacheModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: '10m',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [IntelligenceController],
  providers: [
    IntelligenceService,
    IntelligenceGateway,
    ...Services,
    ...AIProviders,
  ],
})
export class IntelligenceModule {}
