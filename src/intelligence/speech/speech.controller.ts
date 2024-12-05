import { Controller, Res, Get, Query } from '@nestjs/common';
import { Response } from 'express';
import { TextToSpeechService } from './speech.service';
import { Auth } from 'src/auth/decorators';

@Controller('tts')
export class TextToSpeechController {
  constructor(private readonly ttsService: TextToSpeechService) {}

  @Get('convert')
  @Auth()
  async convert(@Query('text') text: string, @Res() res: Response) {
    if (text.length > 145) {
      return res.status(400).json({ error: 'Text exceeds 145 characters' });
    }
    const audioBuffer = await this.ttsService.convertTextToSpeech(text);
    res.status(200).set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
    });
    res.send(audioBuffer);
  }
}
