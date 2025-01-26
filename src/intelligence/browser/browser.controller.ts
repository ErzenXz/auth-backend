// browser.controller.ts
import { Controller, Get, Query } from '@nestjs/common';
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
}
