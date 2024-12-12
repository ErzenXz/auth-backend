import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SortArticlesDto {
  @ApiProperty({
    required: false,
    example: 'asc',
    description: 'Sort by published date',
  })
  @IsOptional()
  @IsString()
  @Type(() => String)
  sortOrder?: 'asc' | 'desc';
}
