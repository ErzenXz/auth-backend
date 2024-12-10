import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SortArticlesDto {
  @ApiProperty({
    required: false,
    example: 'asc',
    description: 'Sort by published date',
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}
