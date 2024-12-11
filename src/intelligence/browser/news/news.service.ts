import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CreateSourceDto } from './dtos/create-source.dto';
import { GetArticlesDto } from './dtos/get-articles.dto';
import { UpdateSourceDto } from './dtos/update-source.dto';
import { FilterArticlesDto, SearchArticlesDto, SortArticlesDto } from './dtos';

@Injectable()
export class NewsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('news-queue') private readonly newsQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.scheduleNewsFetch();
  }

  async scheduleNewsFetch() {
    await this.newsQueue.add(
      'fetch-news',
      {},
      {
        repeat: { every: 60000 }, // Every 1 minute
      },
    );
  }

  async createSource(createSourceDto: CreateSourceDto) {
    return this.prisma.source.create({ data: createSourceDto });
  }

  async updateSource(id: number, updateSourceDto: UpdateSourceDto) {
    return this.prisma.source.update({
      where: { id },
      data: updateSourceDto,
    });
  }

  async deleteSource(id: number) {
    return this.prisma.source.delete({ where: { id } });
  }

  async getArticles(getArticlesDto: GetArticlesDto) {
    const {
      country,
      language,
      category,
      sourceId,
      page = 1,
      pageSize = 10,
    } = getArticlesDto;

    const where: any = {};

    if (sourceId) {
      where.sourceId = sourceId;
    }
    if (language) {
      where.language = language;
    }
    if (category) {
      where.source = { category };
    }
    if (sourceId) {
      where.sourceId = sourceId;
    }

    const articles = await this.prisma.article.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { source: true },
      orderBy: { publishedAt: 'desc' },
    });

    const total = await this.prisma.article.count({ where });

    return {
      data: articles,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async searchArticles(searchDto: SearchArticlesDto) {
    const { query, fromDate, toDate } = searchDto;
    return this.prisma.article.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { content: { contains: query, mode: 'insensitive' } },
        ],
        publishedAt: {
          gte: fromDate ? new Date(fromDate) : undefined,
          lte: toDate ? new Date(toDate) : undefined,
        },
      },
      orderBy: { publishedAt: 'desc' },
    });
  }

  async filterArticles(filterDto: FilterArticlesDto) {
    const { categories, authors } = filterDto;
    return this.prisma.article.findMany({
      where: {
        AND: [
          categories
            ? {
                source: {
                  category: { in: categories },
                },
              }
            : {},
          authors ? { author: { in: authors } } : {},
        ],
      },
      orderBy: { publishedAt: 'desc' },
    });
  }

  async sortArticles(sortDto: SortArticlesDto) {
    const { sortOrder } = sortDto;
    return this.prisma.article.findMany({
      orderBy: { publishedAt: sortOrder || 'desc' },
    });
  }

  async advancedSearch(
    params: GetArticlesDto &
      SearchArticlesDto &
      FilterArticlesDto &
      SortArticlesDto,
  ) {
    const {
      query,
      fromDate,
      toDate,
      categories,
      authors,
      country,
      language,
      category,
      sourceId,
      page = 1,
      pageSize = 10,
      sortOrder = 'desc',
    } = params;

    const where: any = {};

    if (sourceId) {
      where.sourceId = sourceId;
    }
    if (language) {
      where.language = language;
    }
    if (category) {
      where.source = { category };
    }
    if (country) {
      where.country = country;
    }
    if (query) {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { content: { contains: query, mode: 'insensitive' } },
      ];
    }
    if (fromDate || toDate) {
      where.publishedAt = {};
      if (fromDate) {
        where.publishedAt.gte = new Date(fromDate);
      }
      if (toDate) {
        where.publishedAt.lte = new Date(toDate);
      }
    }
    if (categories) {
      where.source.category = { in: categories };
    }
    if (authors) {
      where.author = { in: authors };
    }

    const articles = await this.prisma.article.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { source: true },
      orderBy: { publishedAt: sortOrder },
    });

    const total = await this.prisma.article.count({ where });

    return {
      data: articles,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
