// browser.controller.ts
import { Controller, Get, Query, Res } from '@nestjs/common';
import { BrowserService } from './browser.service';
import { AIResponse } from '../models/ai-wrapper.types';

@Controller('browser')
export class BrowserController {
  constructor(private readonly browserService: BrowserService) {}

  @Get('fetch')
  async fetchUrl(@Query('url') url: string): Promise<AIResponse> {
    return this.browserService.fetchAndProcessUrl(url);
  }

  @Get('search')
  async searchWeb(@Query('query') query: string): Promise<AIResponse> {
    return this.browserService.searchAndProcess(query);
  }

  @Get('raw-search')
  async rawSearch(@Query('query') query: string) {
    return this.browserService.searchRaw(query);
  }

  @Get('raw-fetch')
  async rawFetch(@Query('url') url: string) {
    return this.browserService.fetchRaw(url);
  }

  @Get('ai-search')
  async aiSearch(@Query('query') query: string) {
    return this.browserService.aiSearch(query, 'guest');
  }

  @Get('ai-search/stream')
  async aiSearchStream(@Query('query') query: string, @Res() response: any) {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');

    try {
      await this.browserService.aiSearchStream(query, 'guest', (data) => {
        response.write(`data: ${JSON.stringify(data)}\n\n`);
      });
      response.end();
    } catch (error) {
      response.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      response.end();
    }
  }
}
