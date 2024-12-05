import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ElevenLabsClient } from 'elevenlabs';

@Injectable()
export class TextToSpeechService {
  private readonly client: ElevenLabsClient;
  private readonly MODEL_ID = 'eleven_turbo_v2_5';

  constructor() {
    this.client = new ElevenLabsClient({
      apiKey: process.env.ELEVENLABS_API_KEY,
    });
  }

  async convertTextToSpeech(text: string): Promise<Buffer> {
    try {
      const response = await this.client.textToSpeech.convert(
        '21m00Tcm4TlvDq8ikWAM',
        {
          text,
          model_id: this.MODEL_ID,
        },
      );
      const chunks = [];
      for await (const chunk of response) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      throw new HttpException(
        'Failed to convert text to speech: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
