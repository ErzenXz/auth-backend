import { IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SearchArticlesDto {
  @ApiProperty({ required: false, example: 'breaking news' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiProperty({ required: false, example: '2023-01-01' })
  @IsOptional()
  @IsString()
  fromDate?: string;

  @ApiProperty({ required: false, example: '2023-12-31' })
  @IsOptional()
  @IsString()
  toDate?: string;
}
