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
  constructor(
    private readonly cacheService: XCacheService,
    private readonly aiWrapperService: AiWrapperService,
  ) {}

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
  You are an expert AI search engine tasked with analyzing and summarizing web content for the query "${query || 'the given topic'}". Your response must be clear, structured, and comprehensive, following the guidelines below:

------------------------------
**1. Quick Facts:**  
   - Provide a brief overview with the most essential data and statistics related to the topic.

**2. Content Analysis:**  
   - **Primary Subject:** Identify and explain the main topic or subject of the content.  
   - **Key Information:** Extract and list essential facts, data, and statistics using bullet points.  
   - **Context:** Offer relevant background information and explain the current significance of the topic.  
   - **Expert Analysis:** Present authoritative insights and interpretations based on the content.

**3. Multimedia Elements:**  
   - **Images:** Identify all relevant images and include them in Markdown format as:  
     ![description](url)  
   - **Videos:** Include any pertinent videos using Markdown format as:  
     [video title](url)
   - **References:** Provide source links in Markdown format as:  
     [source name](url)

**4. Structural and Formatting Requirements:**  
   - Organize the response into clear, labeled sections with headers.  
   - Use bullet points to highlight key facts and information.  
   - Conclude with a "Key Takeaways" section that summarizes the main insights.  
   - Preserve and correctly format all URLs and multimedia elements.  
   - Ensure proper Markdown formatting throughout the response.

**5. Content Specifications:**  
   - Write in an authoritative, factual, and academic tone.  
   - Only include verified information derived from the provided content.  
   - Ensure the response is grammatically correct and easy to read.  
   - The response should be a minimum of 300 words and a maximum of 2000 words.

------------------------------
**Analyze this content:**  
${text}

  `;

    try {
      return await this.aiWrapperService.generateContent(
        AIModels.GeminiFast,
        prompt,
      );
    } catch (error) {
      console.error(error);
      return { content: 'Failed to process content' };
    }
  }
}
