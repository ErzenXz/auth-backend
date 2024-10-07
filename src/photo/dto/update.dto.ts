import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export class UpdatePhotoDto {
  @ApiProperty({ description: 'The unique identifier of the photo' })
  @IsInt()
  @IsNotEmpty()
  id: number;

  @ApiProperty({ description: 'The URL of the photo' })
  @IsUrl()
  @IsNotEmpty()
  @IsString()
  url: string;

  @ApiPropertyOptional({ description: 'The caption for the photo' })
  @IsOptional()
  @IsString()
  caption?: string;
}
