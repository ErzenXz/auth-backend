// browser.service.ts
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { ConfigService } from '@nestjs/config';
import { AIResponse } from '../models/intelligence.types';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { XCacheService } from 'src/cache/cache.service';

@Injectable()
export class BrowserService {
  private genAI: GoogleGenerativeAI;
  private defaultModel: string;
  private advancedModel: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: XCacheService,
  ) {
    const apiKey = this.configService.get<string>('GOOGLE_API_KEY');
    this.genAI = new GoogleGenerativeAI(apiKey);

    this.defaultModel = this.configService.get<string>('GOOGLE_AI_MODEL_NAME');
    this.advancedModel = this.configService.get<string>(
      'GOOGLE_AI_MODEL_NAME_ADVANCED',
    );
  }

  async fetchAndProcessUrl(url: string): Promise<AIResponse> {
    const cacheKey = `url:${url}`;
    const cachedResponse = await this.cacheService.getCache(cacheKey);

    if (cachedResponse) {
      return JSON.parse(cachedResponse);
    }

    try {
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
        },
      });
      const text = this.extractText(data);
      const aiResponse = await this.processWithAI(text);

      await this.cacheService.setCache(cacheKey, JSON.stringify(aiResponse));
      return aiResponse;
    } catch (error) {
      throw new HttpException(
        'Failed to fetch and process URL',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async searchAndProcess(query: string): Promise<AIResponse> {
    const cacheKey = `search:${query}`;
    const cachedResponse = await this.cacheService.getCache(cacheKey);

    if (cachedResponse) {
      return JSON.parse(cachedResponse);
    }

    try {
      const urls = await this.performSearch(query);
      let combinedText = '';
      for (const url of urls) {
        try {
          const { data } = await axios.get(url, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            },
            timeout: 5000,
          });
          combinedText += this.extractText(data);
          await new Promise((resolve) => setTimeout(resolve, 2));
        } catch (urlError) {
          continue;
        }
      }
      if (!combinedText) {
        throw new Error('No content could be fetched from any URL');
      }
      const aiResponse = await this.processWithAI(combinedText, query);
      await this.cacheService.setCache(cacheKey, JSON.stringify(aiResponse));
      return aiResponse;
    } catch (error) {
      throw new HttpException(
        'Failed to search and process query: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private extractText(html: string): string {
    const $ = cheerio.load(html);
    // Common selectors for main content areas
    const contentSelectors = [
      'article',
      'main',
      '.content',
      '.main-content',
      '#content',
      '#main-content',
    ];

    let content = '';
    for (const selector of contentSelectors) {
      const element = $(selector);
      if (element.length) {
        // Remove script, style, and other non-content elements
        element.find('script, style, nav, header, footer, aside').remove();
        content = element.text();
        break;
      }
    }

    // Fallback to body if no content found
    if (!content) {
      content = $('body').text();
    }

    // Clean up the text
    return content.replace(/\s+/g, ' ').trim();
  }

  private async performSearch(query: string): Promise<string[]> {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    try {
      const { data } = await axios.get(searchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
      });
      const $ = cheerio.load(data);
      const links: string[] = [];

      $('a.result__url').each((_, element) => {
        if (links.length < 3) {
          const href = $(element).attr('href');
          if (href) {
            const url = this.extractUrl(href);
            if (url) {
              links.push(url);
            }
          }
        }
      });

      return links;
    } catch (error) {
      throw new HttpException(
        'Search scraping failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private extractUrl(url: string): string | null {
    const match = url.match(/uddg=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  private async processWithAI(
    text: string,
    query?: string,
  ): Promise<AIResponse> {
    const prompt = `
You are an expert summarizer. Analyze the following HTML content that was scraped about ${query || 'the given topic'}. Provide a clear, professional, and confident summary as if explaining to someone unfamiliar with the subject. Focus on:

1. What is the main topic of the content?
2. Who or what is the subject, and what do they do or represent?
3. Key facts, findings, or highlights about the subject.
4. Relevant context and background information.
5. A succinct and definitive takeaway.

RULES:
1. DO NOT say "I think" or "I believe." Write as if you are an expert.
2. DO NOT include personal opinions, speculation, or hypotheticals.
3. DO NOT SAY the content appears to be html snippet or anything similar.
4. Ensure the summary is well-written, straightforward, and authoritative, like a concise answer in a trusted encyclopedia or search engine. Avoid any vague or filler language.
5. ENSURE the summary is accurate, relevant, and informative.

HTML content to analyze:
${text}
`;

    try {
      let model = this.genAI.getGenerativeModel({
        model: this.defaultModel,
      });

      const aiResult = await model.generateContent(prompt);
      let result = aiResult.response.text().trim();

      return {
        result: {
          content: result,
        },
      };
    } catch (error) {
      throw new HttpException(
        'AI Processing Error',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
