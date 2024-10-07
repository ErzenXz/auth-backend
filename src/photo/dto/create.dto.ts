import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePhotoDto {
  @ApiProperty({
    description: 'The URL of the photo',
    example: 'http://example.com/photo.jpg',
  })
  @IsUrl()
  @IsNotEmpty()
  @IsString()
  url: string;

  @ApiPropertyOptional({
    description: 'The caption for the photo',
    example: 'A beautiful sunset',
  })
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiPropertyOptional({
    description: 'The IDs of the albums this photo belongs to',
    example: [1, 2, 3],
  })
  @IsArray()
  @IsOptional()
  albumIds?: number[];
}
