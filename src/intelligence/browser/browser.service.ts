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
  private readonly concurrencyLimit = 25;
  private activeRequests = 0;
  private readonly userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/121.0.0.0',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.130 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/100.0.4896.127 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 7.0; Moto G (4)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4590.2 Mobile Safari/537.36 Chrome-Lighthouse',
  ];

  constructor(
    private readonly cacheService: XCacheService,
    private readonly aiWrapperService: AiWrapperService,
  ) {}

  private getRandomUserAgent(): string {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  private async withConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
    while (this.activeRequests >= this.concurrencyLimit) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    this.activeRequests++;
    try {
      return await fn();
    } finally {
      this.activeRequests--;
    }
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
          $(element)
            .find(
              'script, style, nav, header, footer, form, iframe, .ads, #ads, .advertisement, .popup, .modal, .overlay, .cookie-banner, .newsletter, .sidebar, .social-share, .comments, .related-posts',
            )
            .remove();

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
      return await this.withConcurrencyLimit(async () => {
        const { data } = await axios.get(searchUrl, {
          headers: {
            'User-Agent': this.getRandomUserAgent(),
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
      });
    } catch (error) {
      return [];
    }
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
        AIModels.Gemini,
        prompt,
      );
    } catch (error) {
      console.error(error);
      return { content: 'Failed to process content' };
    }
  }

  async fetchRaw(url: string) {
    const cacheKey = `raw:${url}`;
    const cached = await this.cacheService.getCache(cacheKey);
    if (cached) return JSON.parse(cached);

    const content = await this.fetchWithRetry(url);
    await this.cacheService.setCache(cacheKey, JSON.stringify(content));
    return content;
  }

  private async retryOperation<T>(
    operation: () => Promise<T>,
    retries = 3,
    delay = 1000,
  ): Promise<T> {
    for (let i = 0; i <= retries; i++) {
      try {
        return await operation();
      } catch (error) {
        if (i === retries) throw error;
        await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
      }
    }
    throw new Error('Retry operation failed');
  }

  private async fetchWithRetry(url: string) {
    return this.retryOperation(async () => {
      const { data } = await axios.get(url, {
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          Connection: 'keep-alive',
        },
        timeout: 10000,
      });
      return this.extractContent(data);
    }, 3);
  }

  async searchRaw(query: string) {
    const cacheKey = `raw-search:${query}`;
    const cached = await this.cacheService.getCache(cacheKey);
    if (cached) return JSON.parse(cached);

    const results = await this.performEnhancedSearch(query);
    await this.cacheService.setCache(cacheKey, JSON.stringify(results));
    return results;
  }

  private async performEnhancedSearch(query: string) {
    const engines = [
      () => this.searchDuckDuckGo(query),
      () => this.searchWikipedia(query),
    ];

    const results = await Promise.all(engines.map((engine) => engine()));
    const flatResults = results.flat().filter(Boolean);
    const uniqueResults = Array.from(
      new Map(flatResults.map((item) => [item.url, item])).values(),
    );

    return uniqueResults.slice(0, 10);
  }

  private async searchDuckDuckGo(query: string) {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    try {
      const { data } = await axios.get(searchUrl, {
        headers: {
          'User-Agent': this.getRandomUserAgent(),
        },
      });
      const $ = cheerio.load(data);
      const results = [];

      $('.result').each((_, element) => {
        const title = $(element).find('.result__title').text().trim();
        const url = this.extractUrl(
          $(element).find('.result__url').attr('href'),
        );
        const snippet = $(element).find('.result__snippet').text().trim();

        if (url && this.isValidUrl(url)) {
          results.push({ title, url, snippet });
        }
      });

      return results;
    } catch (error) {
      console.error('DuckDuckGo search error:', error);
      return [];
    }
  }

  private async searchWikipedia(query: string) {
    const WIKI_API = 'https://en.wikipedia.org/w/api.php';

    try {
      const { data } = await axios.get(WIKI_API, {
        params: {
          action: 'query',
          list: 'search',
          srsearch: query,
          format: 'json',
          utf8: 1,
          srlimit: 5,
        },
      });

      return data.query.search.map((result) => ({
        title: result.title,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title)}`,
        snippet: this.stripHtmlTags(result.snippet),
      }));
    } catch (error) {
      console.error('Wikipedia search error:', error);
      return [];
    }
  }

  private async fetchContentForAI(url: string) {
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': this.getRandomUserAgent() },
      timeout: 10000,
    });

    const $ = cheerio.load(data);

    // Remove unnecessary elements
    $(
      'script, style, nav, header, footer, iframe, .ads, #ads, .advertisement, .popup, .modal, .overlay, .cookie-banner, .newsletter, .sidebar, .social-share, .comments, .related-posts, form, button, .menu, [class*="menu"], [id*="menu"], [class*="popup"], [id*="popup"], [class*="modal"], [id*="modal"]',
    ).remove();

    const title = $('title').text().trim();
    const mainContent = this.extractText(data);
    const summary = mainContent.split(' ').slice(0, 400).join(' ') + '...';

    return {
      title,
      summary,
      content: mainContent,
      timestamp: new Date().toISOString(),
    };
  }

  private stripHtmlTags(html: string): string {
    return html.replace(/<\/?[^>]+(>|$)/g, '');
  }

  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength - 3) + '...';
  }

  async aiSearch(query: string) {
    const cacheKey = `ai-search:${query}`;
    const cached = await this.cacheService.getCache(cacheKey);
    if (cached) return JSON.parse(cached);

    const searchResults = await Promise.all([
      this.searchDuckDuckGo(query),
      this.searchWikipedia(query),
    ]);

    const allResults = searchResults.flat().filter(Boolean);
    const uniqueUrls = Array.from(new Set(allResults.map((r) => r.url))).slice(
      0,
      5,
    );

    const contents = await Promise.all(
      uniqueUrls.map(async (url) => {
        try {
          const content = await this.fetchContentForAI(url);
          return { url, ...content };
        } catch (error) {
          return null;
        }
      }),
    );

    const validContents = contents.filter(Boolean).map((content) => ({
      ...content,
      content: this.truncateContent(content.content, 2000), // Limit content length
    }));

    const result = {
      query,
      sources: validContents,
      timestamp: new Date().toISOString(),
    };

    await this.cacheService.setCache(cacheKey, JSON.stringify(result));
    return result;
  }

  private extractContent(html: string) {
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $(
      'script, style, nav, header, footer, iframe, .ads, #ads, .advertisement, .popup, .modal, .overlay, .cookie-banner, .newsletter, .sidebar, .social-share, .comments, .related-posts, form, button, .menu, [class*="menu"], [id*="menu"], [class*="popup"], [id*="popup"], [class*="modal"], [id*="modal"]',
    ).remove();

    const metadata = {
      title: $('title').text().trim() || $('h1').first().text().trim(),
      description: $('meta[name="description"]').attr('content') || '',
      keywords: $('meta[name="keywords"]').attr('content') || '',
    };

    const content = this.extractText(html);
    const links = this.extractLinks($);
    const images = this.extractImages($);

    return {
      metadata,
      content,
      links,
      images,
    };
  }

  private extractLinks($: cheerio.CheerioAPI) {
    const links = [];
    $('a').each((_, element) => {
      const href = $(element).attr('href');
      const text = $(element).text().trim();
      if (href && text && this.isValidUrl(href)) {
        links.push({ href, text });
      }
    });
    return links;
  }

  private extractImages($: cheerio.CheerioAPI) {
    const images = [];
    $('img').each((_, element) => {
      const src = $(element).attr('src');
      const alt = $(element).attr('alt') || '';
      if (src && this.isValidUrl(src)) {
        images.push({ src, alt });
      }
    });
    return images;
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  async aiSearchStream(query: string, emitUpdate: (data: any) => void) {
    emitUpdate({ status: 'started', message: 'Starting search...', query });

    try {
      // Search phase
      emitUpdate({ status: 'searching', message: 'Searching DuckDuckGo...' });
      const duckResults = await this.searchDuckDuckGo(query);

      emitUpdate({ status: 'searching', message: 'Searching Wikipedia...' });
      const wikiResults = await this.searchWikipedia(query);

      const allResults = [...duckResults, ...wikiResults].filter(Boolean);
      const uniqueUrls = Array.from(
        new Set(allResults.map((r) => r.url)),
      ).slice(0, 5);

      emitUpdate({
        status: 'found',
        message: `Found ${uniqueUrls.length} sources to analyze`,
        sources: allResults,
      });

      // Content fetching phase
      const contents = [];
      for (const url of uniqueUrls) {
        try {
          emitUpdate({
            status: 'fetching',
            message: `Fetching content from ${url}...`,
          });

          const content = await this.fetchContentForAI(url);
          const processedContent = {
            url,
            ...content,
            content: this.truncateContent(content.content, 2000),
          };

          contents.push(processedContent);
          emitUpdate({
            status: 'fetched',
            message: `Successfully processed ${url}`,
            content: processedContent,
          });
        } catch (error) {
          emitUpdate({
            status: 'error',
            message: `Failed to fetch ${url}`,
            error: error.message,
          });
        }
      }

      const result = {
        query,
        sources: contents,
        timestamp: new Date().toISOString(),
      };

      emitUpdate({
        status: 'completed',
        message: 'Search completed',
        result,
      });

      // Cache the final result
      const cacheKey = `ai-search:${query}`;
      await this.cacheService.setCache(cacheKey, JSON.stringify(result));

      return result;
    } catch (error) {
      emitUpdate({
        status: 'error',
        message: 'Search failed',
        error: error.message,
      });
      throw error;
    }
  }
}
