import { IsOptional, IsString, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class FilterArticlesDto {
  @ApiProperty({ required: false, example: ['technology', 'health'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiProperty({ required: false, example: ['author1', 'author2'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  authors?: string[];
}
