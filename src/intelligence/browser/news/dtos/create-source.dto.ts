import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl } from 'class-validator';

export class CreateSourceDto {
  @ApiProperty({ description: 'Name of the source' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'URL of the source' })
  @IsUrl()
  url: string;

  @ApiProperty({ description: 'Country of the source' })
  @IsString()
  country: string;

  @ApiProperty({ description: 'Language of the source' })
  @IsString()
  language: string;

  @ApiProperty({ description: 'Category of the source' })
  @IsString()
  category: string;
}
