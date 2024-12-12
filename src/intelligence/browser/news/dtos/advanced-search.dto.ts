import { IntersectionType } from '@nestjs/swagger';
import { GetArticlesDto } from './get-articles.dto';
import { SearchArticlesDto } from './search-articles.dto';
import { FilterArticlesDto } from './filter-articles.dto';
import { SortArticlesDto } from './sort-articles.dto';

export class AdvancedSearchDto extends IntersectionType(
  GetArticlesDto,
  IntersectionType(
    SearchArticlesDto,
    IntersectionType(FilterArticlesDto, SortArticlesDto),
  ),
) {}
