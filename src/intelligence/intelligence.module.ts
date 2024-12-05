import { Module } from '@nestjs/common';
import { IntelligenceService } from './intelligence.service';
import { IntelligenceController } from './intelligence.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { TextToSpeechModule } from './speech/speech.module';
import { BrowserModule } from './browser/browser.module';

@Module({
  imports: [PrismaModule, ConfigModule, TextToSpeechModule, BrowserModule],
  controllers: [IntelligenceController],
  providers: [IntelligenceService],
})
export class IntelligenceModule {}
