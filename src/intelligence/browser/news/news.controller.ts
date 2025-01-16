import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { NewsService } from './news.service';
import { CreateSourceDto } from './dtos/create-source.dto';
import { GetArticlesDto } from './dtos/get-articles.dto';
import { UpdateSourceDto } from './dtos/update-source.dto';
import { Role } from 'src/auth/enums';
import { Auth } from 'src/auth/decorators';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FilterArticlesDto } from './dtos/filter-articles.dto';
import { SearchArticlesDto } from './dtos/search-articles.dto';
import { SortArticlesDto } from './dtos/sort-articles.dto';
import { AdvancedSearchDto } from './dtos/advanced-search.dto';

@ApiTags('News')
@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Post('sources')
  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  async createSource(@Body() createSourceDto: CreateSourceDto) {
    return this.newsService.createSource(createSourceDto);
  }

  @Put('sources/:id')
  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  async updateSource(
    @Param('id') id: string,
    @Body() updateSourceDto: UpdateSourceDto,
  ) {
    return this.newsService.updateSource(Number(id), updateSourceDto);
  }

  @Delete('sources/:id')
  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  async deleteSource(@Param('id') id: string) {
    return this.newsService.deleteSource(Number(id));
  }

  @Get('get-articles')
  @ApiOperation({ summary: 'Get paginated articles' })
  @ApiResponse({ status: 200, description: 'List of articles.' })
  getArticles(@Query() getArticlesDto: GetArticlesDto) {
    return this.newsService.getArticles(getArticlesDto);
  }

  @Get('get-article/:id')
  @ApiOperation({ summary: 'Get article by id' })
  @ApiResponse({ status: 200, description: 'Article.' })
  getArticle(@Param('id') id: string) {
    return this.newsService.getArticleById(Number(id));
  }

  @Get('get-sources')
  @ApiOperation({ summary: 'Get all sources' })
  @ApiResponse({ status: 200, description: 'List of sources.' })
  getSources() {
    return this.newsService.getSources();
  }

  @Get('search')
  @ApiOperation({ summary: 'Search articles by query and date range' })
  @ApiResponse({ status: 200, description: 'Search results.' })
  searchArticles(@Query() searchArticlesDto: SearchArticlesDto) {
    return this.newsService.searchArticles(searchArticlesDto);
  }

  @Get('filter')
  @ApiOperation({ summary: 'Filter articles by categories and authors' })
  @ApiResponse({ status: 200, description: 'Filtered articles.' })
  filterArticles(@Query() filterArticlesDto: FilterArticlesDto) {
    return this.newsService.filterArticles(filterArticlesDto);
  }

  @Get('sort')
  @ApiOperation({ summary: 'Sort articles by published date' })
  @ApiResponse({ status: 200, description: 'Sorted articles.' })
  sortArticles(@Query() sortArticlesDto: SortArticlesDto) {
    return this.newsService.sortArticles(sortArticlesDto);
  }

  @Get('advanced-search')
  @ApiOperation({ summary: 'Advanced search with multiple filters' })
  @ApiResponse({ status: 200, description: 'Advanced search results.' })
  advancedSearch(@Query() advancedSearchDto: AdvancedSearchDto) {
    return this.newsService.advancedSearch(advancedSearchDto);
  }
}
