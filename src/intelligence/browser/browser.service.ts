// browser.service.ts
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { XCacheService } from 'src/cache/cache.service';
import { AiWrapperService } from '../providers/ai-wrapper.service';
import { AIResponse } from '../models/ai-wrapper.types';
import { AIModels } from '../enums/models.enum';
import { UsageService } from '../usage/usage.service';

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
    private readonly usageService: UsageService,
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

  private async searchTavily(query: string) {
    // Remove quotes from query to prevent JSON parsing issues
    const sanitizedQuery = query.replace(/"/g, '');

    const options = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: sanitizedQuery,
        topic: 'general',
        search_depth: 'advanced',
        chunks_per_source: 3,
        max_results: 5,
        time_range: null,
        days: 7,
        include_answer: false,
        include_raw_content: false,
        include_images: true,
        include_image_descriptions: false,
        include_domains: [],
        exclude_domains: [],
      }),
    };

    try {
      console.log(`Tavily search request for: "${sanitizedQuery}"`);
      const response = await fetch('https://api.tavily.com/search', options);

      if (!response.ok) {
        console.error(
          `Tavily API error: ${response.status} ${response.statusText}`,
        );
        const errorText = await response.text();
        console.error(`Tavily error response: ${errorText}`);
        return { results: [], images: [] };
      }

      const data = await response.json();
      console.log(
        `Tavily search success: ${data.results?.length || 0} results, ${data.images?.length || 0} images`,
      );
      return data || { results: [], images: [] };
    } catch (error) {
      console.error('Tavily search error:', error);
      return { results: [], images: [] };
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

  async aiSearch(query: string, userId: string) {
    // Check usage limits before proceeding
    if (userId) {
      const hasAvailableUsage =
        await this.usageService.checkAndIncrementUsage(userId);
      if (!hasAvailableUsage) {
        throw new HttpException(
          'You have reached your monthly search limit. Please upgrade your plan for more searches.',
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    }

    const cacheKey = `ai-search:${query}`;
    const cached = await this.cacheService.getCache(cacheKey);
    if (cached) return JSON.parse(cached);

    const searchResults = await Promise.all([
      this.searchDuckDuckGo(query),
      this.searchWikipedia(query),
    ]);

    const tavilyData = await this.searchTavily(query);

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

    // Add Tavily results if available
    const tavilyContents = (
      Array.isArray(tavilyData.results) ? tavilyData.results : []
    ).map((result) => ({
      url: result.url,
      title: result.title,
      content: result.content,
    }));

    // Add Tavily contents to the sources
    contents.push(...tavilyContents);

    // Add Tavily images as additional sources (if any)
    const tavilyImages = (
      Array.isArray(tavilyData.images) ? tavilyData.images : []
    ).map((imgUrl: string) => ({
      url: imgUrl,
      title: 'Image',
      content: `![Image](${imgUrl})`,
    }));

    contents.push(...tavilyImages);

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

  async aiSearchStream(
    query: string,
    userId: string,
    emitCallback?: Function,
  ): Promise<any> {
    // Check usage limits before proceeding
    if (userId) {
      const hasAvailableUsage =
        await this.usageService.checkAndIncrementUsage(userId);
      if (!hasAvailableUsage) {
        if (emitCallback) {
          emitCallback({
            status: 'error',
            message:
              'You have reached your monthly search limit. Please upgrade your plan for more searches.',
            code: 'USAGE_LIMIT_REACHED',
          });
        }

        throw new HttpException(
          'You have reached your monthly search limit. Please upgrade your plan for more searches.',
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    }

    // Sanitize the query by removing quotes to prevent JSON parsing issues
    const sanitizedQuery = query.replace(/^["']|["']$/g, '');
    let sources = [];
    let contents = [];
    const timestamp = new Date().toISOString();
    let tavilyResponse = null;

    try {
      // Emit status updates if a callback is provided
      if (emitCallback) {
        emitCallback({
          status: 'searching',
          message: `Searching for "${sanitizedQuery}"...`,
        });
      }

      // 1. Start with a Tavily search
      if (emitCallback) {
        emitCallback({
          status: 'tavily_search',
          message: 'Searching Tavily...',
        });
      }

      try {
        tavilyResponse = await this.searchTavily(sanitizedQuery);

        // Debug logs for Tavily response
        console.log(`Tavily search for "${sanitizedQuery}" returned:`);
        console.log(`- Text results: ${tavilyResponse?.results?.length || 0}`);
        console.log(`- Images: ${tavilyResponse?.images?.length || 0}`);

        // Process Tavily text results
        if (tavilyResponse?.results && Array.isArray(tavilyResponse.results)) {
          tavilyResponse.results.forEach((result) => {
            if (result && result.url) {
              // Add to sources for the final response
              sources.push({
                title: result.title || 'Tavily Result',
                url: result.url,
                content: result.content || '',
                source: 'tavily',
              });

              // Add to contents for processing
              contents.push({
                url: result.url,
                title: result.title || 'Tavily Result',
                content: result.content || '',
                source: 'tavily',
              });
            }
          });
        }

        // Process Tavily image results
        if (tavilyResponse?.images && Array.isArray(tavilyResponse.images)) {
          tavilyResponse.images.forEach((imageUrl) => {
            if (imageUrl) {
              // Add to sources for the final response
              sources.push({
                title: 'Image from Tavily',
                url: imageUrl,
                content: `![Image](${imageUrl})`,
                source: 'tavily_image',
              });
            }
          });
        }

        // Notify client about Tavily search completion
        if (emitCallback) {
          emitCallback({
            status: 'tavily_complete',
            message: `Found ${tavilyResponse?.results?.length || 0} results and ${tavilyResponse?.images?.length || 0} images.`,
            rawTavilyData: tavilyResponse,
          });
        }
      } catch (error) {
        console.error('Tavily search error:', error);
        if (emitCallback) {
          emitCallback({
            status: 'error',
            message: 'Error during Tavily search.',
          });
        }
      }

      // 2. Continue with additional searches (Wikipedia and DuckDuckGo)
      if (emitCallback) {
        emitCallback({
          status: 'additional_search',
          message: 'Searching additional sources...',
        });
      }

      try {
        // Fetch results from DuckDuckGo and Wikipedia
        const [duckDuckGoResults, wikipediaResults] = await Promise.all([
          this.searchDuckDuckGo(sanitizedQuery),
          this.searchWikipedia(sanitizedQuery),
        ]);

        // Combine all search results
        const additionalResults = [
          ...(duckDuckGoResults || []),
          ...(wikipediaResults || []),
        ].filter(Boolean);

        // Get unique URLs from the additional results
        const uniqueUrls = Array.from(
          new Set(additionalResults.map((r) => r.url)),
        ).slice(0, 5);

        // Process content for these URLs
        const additionalContents = await Promise.all(
          uniqueUrls.map(async (url) => {
            try {
              const content = await this.fetchContentForAI(url);
              const sourceType = wikipediaResults.some((r) => r.url === url)
                ? 'wikipedia'
                : 'duckduckgo';

              // Add to the sources array
              sources.push({
                title: content.title || 'Search Result',
                url: url,
                content: content.content || '',
                source: sourceType,
              });

              return {
                url,
                ...content,
                source: sourceType,
              };
            } catch (error) {
              console.error(`Error fetching content for ${url}:`, error);
              return null;
            }
          }),
        );

        // Add valid additional contents to the contents array
        contents.push(...additionalContents.filter(Boolean));

        if (emitCallback) {
          emitCallback({
            status: 'additional_search_complete',
            message: `Found ${additionalContents.filter(Boolean).length} additional results.`,
          });
        }
      } catch (error) {
        console.error('Error in additional searches:', error);
        if (emitCallback) {
          emitCallback({
            status: 'warning',
            message:
              'Some additional searches failed, but continuing with available results.',
          });
        }
      }

      // Log the sources collected for debugging
      console.log('Sources collected:');
      console.log(
        `- Tavily text results: ${sources.filter((s) => s.source === 'tavily').length}`,
      );
      console.log(
        `- Tavily images: ${sources.filter((s) => s.source === 'tavily_image').length}`,
      );
      console.log(
        `- Wikipedia: ${sources.filter((s) => s.source === 'wikipedia').length}`,
      );
      console.log(
        `- DuckDuckGo: ${sources.filter((s) => s.source === 'duckduckgo').length}`,
      );
      console.log(
        `- Other: ${sources.filter((s) => !['tavily', 'tavily_image', 'wikipedia', 'duckduckgo'].includes(s.source)).length}`,
      );
      console.log(`Total sources: ${sources.length}`);

      // Return the final result with all sources
      const result = {
        query: sanitizedQuery,
        sources: sources,
        timestamp: timestamp,
      };

      if (emitCallback) {
        emitCallback({
          status: 'completed',
          message: 'Search completed.',
          result: result,
        });
      }

      return result;
    } catch (error) {
      console.error('Error in aiSearchStream:', error);

      if (emitCallback) {
        emitCallback({
          status: 'error',
          message: 'Error performing search. Please try again.',
        });
      }

      return {
        query: sanitizedQuery,
        sources: sources,
        timestamp: timestamp,
        error: error.message,
      };
    }
  }
}
