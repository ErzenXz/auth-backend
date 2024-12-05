import { Module } from '@nestjs/common';
import { TextToSpeechService } from './speech.service';
import { TextToSpeechController } from './speech.controller';

@Module({
  providers: [TextToSpeechService],
  controllers: [TextToSpeechController],
})
export class TextToSpeechModule {}
