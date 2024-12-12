import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SearchArticlesDto {
  @ApiProperty({ required: false, example: 'breaking news' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiProperty({ required: false, example: '2023-01-01' })
  @IsOptional()
  @IsString()
  @Type(() => String)
  fromDate?: string;

  @ApiProperty({ required: false, example: '2023-12-31' })
  @IsOptional()
  @IsString()
  @Type(() => String)
  toDate?: string;
}
