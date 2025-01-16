import { Processor, WorkerHost } from '@nestjs/bullmq';
import { PrismaService } from '../../../prisma/prisma.service';
import Parser from 'rss-parser';
import { CommandControlService } from '../../../services/command-control/command-control.service';

@Processor('news-queue')
export class NewsProcessor extends WorkerHost {
  private readonly parser = new Parser({
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

  async process(): Promise<any> {
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
              try {
                if (!item.link) {
                  console.warn('Skipping article: Missing link');
                  return;
                }

                const existingArticle = await this.prisma.article.findUnique({
                  where: { link: item.link },
                });

                if (!existingArticle) {
                  const sanitizedData = {
                    title: (item.title || '').slice(0, 255) || 'No title',
                    link: item.link,
                    content: item.content || '',
                    summary: item.contentSnippet || '',
                    publishedAt: (() => {
                      try {
                        const date = item.pubDate
                          ? new Date(item.pubDate)
                          : new Date();
                        return !isNaN(date.getTime()) ? date : new Date();
                      } catch {
                        return new Date();
                      }
                    })(),
                    sourceId: source.id,
                    author: (item.creator || item.author || '').slice(0, 255),
                    imageUrl: item.enclosure?.url || null,
                    categories: Array.isArray(item.categories)
                      ? item.categories.map((cat) =>
                          typeof cat === 'object' && cat !== null
                            ? String(cat)
                            : cat,
                        )
                      : [],
                    country: source.country || '',
                    language: source.language || '',
                  };

                  await this.prisma.article.create({ data: sanitizedData });
                }
              } catch (error) {}
            }),
          );
        } catch (error) {}
      }),
    );
  }
}
