import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import * as Parser from 'rss-parser';
import { CommandControlService } from '../../../services/command-control/command-control.service';

@Processor('news-queue')
export class NewsProcessor extends WorkerHost {
  private parser = new Parser({
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
  });
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandControlService: CommandControlService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const sources = await this.prisma.source.findMany();

    // Get the list of active nodes
    const nodes = await this.commandControlService.getAllNodes();
    const totalNodes = nodes.length;

    if (totalNodes === 0) {
      throw new Error('No nodes are online');
    }

    // Determine this node's index
    const currentNode = await this.commandControlService.currentNodeServer();
    const nodeIndex = nodes.findIndex(
      (node) => node.nodeId === currentNode.nodeId,
    );

    if (nodeIndex === -1) {
      throw new Error('Current node not found in the node list');
    }

    // Distribute sources among nodes
    const sourcesForThisNode = sources.filter(
      (_, index) => index % totalNodes === nodeIndex,
    );

    // Fetch and process feeds concurrently
    await Promise.all(
      sourcesForThisNode.map(async (source) => {
        try {
          const feed = await this.parser.parseURL(source.url);

          await Promise.all(
            feed.items.map(async (item) => {
              const existingArticle = await this.prisma.article.findUnique({
                where: { link: item.link },
              });

              if (!existingArticle) {
                await this.prisma.article.create({
                  data: {
                    title: item.title || 'No title',
                    link: item.link,
                    content: item.content,
                    summary: item.contentSnippet,
                    publishedAt: item.pubDate
                      ? new Date(item.pubDate)
                      : new Date(),
                    sourceId: source.id,
                    author: item.creator || item.author,
                    imageUrl: item.enclosure?.url,
                    categories: [],
                    country: source.country,
                    language: source.language,
                  },
                });
              }
            }),
          );
        } catch (error) {
          console.info(
            `Error processing source ${source.url}: ${error.message}`,
          );
        }
      }),
    );
  }
}
