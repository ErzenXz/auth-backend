// browser.service.ts
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { XCacheService } from 'src/cache/cache.service';
import { AiWrapperService } from '../providers/ai-wrapper.service';
import { AIResponse } from '../models/ai-wrapper.types';
import { AIModels } from '../enums/models.enum';

@Injectable()
export class BrowserService {
  private readonly aiWrapperService: AiWrapperService;

  constructor(private readonly cacheService: XCacheService) {}

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

    const urls = await this.performSearch(query);

    const fetchPromises = urls.map(async (url) => {
      try {
        const { data } = await axios.get(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          },
          timeout: 8777,
        });
        return this.extractText(data);
      } catch (urlError) {}
    });

    const results = await Promise.all(fetchPromises);

    const combinedText = results.join(' ');

    if (!combinedText) {
      return { content: 'No results found' };
    }

    const aiResponse = await this.processWithAI(combinedText, query);
    await this.cacheService.setCache(cacheKey, JSON.stringify(aiResponse));
    return aiResponse;
  }

  private extractText(html: string): string {
    const $ = cheerio.load(html);

    const contentSelectors = [
      'article',
      'main',
      '.content',
      '#content',
      'section',
      '.post-content',
      '.entry-content',
      '.article-body',
    ];

    let content = '';
    let mediaContent = [];

    for (const selector of contentSelectors) {
      const elements = $(selector);
      if (elements.length) {
        elements.each((_, element) => {
          // Remove unwanted elements
          $(element).find('script, style, nav, header, footer, form').remove();

          // Extract images
          $(element)
            .find('img')
            .each((_, img) => {
              const src = $(img).attr('src');
              const alt = $(img).attr('alt') || 'image';
              if (src) mediaContent.push(`![${alt}](${src})`);
            });

          // Extract links
          $(element)
            .find('a')
            .each((_, link) => {
              const href = $(link).attr('href');
              const text = $(link).text().trim();
              if (href && text) mediaContent.push(`[${text}](${href})`);
            });

          // Extract text
          const text = $(element).text().replace(/\s+/g, ' ').trim();
          content += `${text} `;

          if (content.length > 5000) return false;
        });
        if (content) break;
      }
    }

    // Combine text and media content
    const finalContent = [content.trim(), ...mediaContent.slice(0, 10)].join(
      '\n',
    );

    return finalContent;
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
    } catch (error) {}
  }

  private extractUrl(url: string): string | null {
    const regex = /uddg=([^&]+)/;
    const match = regex.exec(url);
    return match ? decodeURIComponent(match[1]) : null;
  }

  private async processWithAI(
    text: string,
    query?: string,
  ): Promise<AIResponse> {
    const prompt = `
  You are an expert AI search engine analyzing web content. For the query "${query || 'the given topic'}", provide a comprehensive response including:

  CONTENT ANALYSIS:
  1. Primary Subject: Identify and explain the main topic/subject
  2. Key Information: Extract and present essential facts, data, statistics
  3. Context: Provide relevant background and current significance
  4. Expert Analysis: Offer authoritative insights backed by the content

  MULTIMEDIA ELEMENTS:
  1. Images: Extract and include all relevant images in Markdown format: ![description](url)
  2. Videos: Include relevant video links in Markdown format: [video title](url)
  3. References: Include source links in Markdown format: [source name](url)

  STRUCTURAL REQUIREMENTS:
  1. Format the response in clear sections with headers
  2. Use bullet points for key facts
  3. Include a "Quick Facts" section at the top
  4. End with a "Key Takeaways" section
  5. Preserve all URLs and media found in the content

  RULES:
  1. Write in an authoritative, factual tone
  2. Include only verified information from the content
  3. Present information in a structured, easy-to-read format
  4. Maintain academic-level accuracy and professionalism
  5. Include all relevant multimedia elements found
  6. Ensure proper Markdown formatting for all links and media
  7. Focus on delivering comprehensive, search-engine quality results
  8. Return a minimum of 300 words of content and a maximum of 2000 words
  9. Return in readable, grammatically correct in original language

  Analyze this content:
  ${text}
  `;

    try {
      return await this.aiWrapperService.generateContent(
        AIModels.GeminiFast,
        prompt,
      );
    } catch (error) {
      return { content: 'Failed to process content' };
    }
  }
}
