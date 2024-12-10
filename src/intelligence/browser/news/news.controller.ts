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
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FilterArticlesDto } from './dtos/filter-articles.dto';
import { SearchArticlesDto } from './dtos/search-articles.dto';
import { SortArticlesDto } from './dtos/sort-articles.dto';

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
  advancedSearch(
    @Query() getArticlesDto: GetArticlesDto,
    @Query() searchArticlesDto: SearchArticlesDto,
    @Query() filterArticlesDto: FilterArticlesDto,
    @Query() sortArticlesDto: SortArticlesDto,
  ) {
    return this.newsService.advancedSearch({
      ...getArticlesDto,
      ...searchArticlesDto,
      ...filterArticlesDto,
      ...sortArticlesDto,
    });
  }
}
