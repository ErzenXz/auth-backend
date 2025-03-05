import { Injectable } from '@nestjs/common';
import { PlaywrightCrawler, Dataset } from 'crawlee';
import { chromium } from 'playwright';

@Injectable()
export class CrawlerService {
  private readonly defaultOptions = {
    headless: true,
    maxRequestsPerCrawl: 30,
    maxConcurrency: 10,
  };

  async crawlUrls(urls: string[], options = {}) {
    const crawler = new PlaywrightCrawler({
      ...this.defaultOptions,
      ...options,
      async requestHandler({ page, request, enqueueLinks }) {
        const title = await page.title();
        const content = await this.extractPageContent(page);

        await Dataset.pushData({
          url: request.url,
          title,
          ...content,
        });

        // Optionally crawl links from the page
        await enqueueLinks({
          strategy: 'same-domain',
          transformRequestFunction: (req) => {
            // Exclude certain file types and patterns
            if (req.url.match(/\.(jpg|jpeg|png|pdf|zip|gif)$/i)) return false;
            return req;
          },
        });
      },
      async failedRequestHandler({ request }) {
        console.error(`Failed to crawl: ${request.url}`);
      },
    });

    await crawler.run(urls);
    const dataset = await Dataset.open();
    const items = await dataset.getData();
    await dataset.drop();

    return items.items;
  }

  async searchWithPlaywright(query: string) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    });

    const page = await context.newPage();
    await page.goto(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    );

    const results = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.result'))
        .map((result) => ({
          title: result.querySelector('.result__title')?.textContent?.trim(),
          url: result.querySelector('.result__url')?.getAttribute('href'),
          snippet: result
            .querySelector('.result__snippet')
            ?.textContent?.trim(),
        }))
        .filter((result) => result.url && result.title);
    });

    await browser.close();
    return results;
  }
}
