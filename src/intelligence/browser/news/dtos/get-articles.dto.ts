import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetArticlesDto {
  @ApiProperty({ required: false, example: 'us' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ required: false, example: 'en' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiProperty({ required: false, example: 'technology' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ required: false, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sourceId?: number;

  @ApiProperty({ required: false, example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiProperty({ required: false, example: 10, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pageSize?: number;
}
