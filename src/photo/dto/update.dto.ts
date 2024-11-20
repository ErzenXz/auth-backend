import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

/**
 * Data Transfer Object (DTO) for updating a photo.
 *
 * This DTO defines the structure of the request body required to update a photo's
 * details, including its unique identifier, URL, and an optional caption. It ensures
 * that the necessary validation rules are applied to the input data.
 */
export class UpdatePhotoDto {
  /**
   * The unique identifier of the photo.
   *
   * This property is required and must be an integer. It is validated using
   * class-validator decorators to ensure that it is not empty and is of the
   * correct type.
   */
  @ApiProperty({ description: 'The unique identifier of the photo' })
  @IsInt()
  @IsNotEmpty()
  id: number;

  /**
   * The URL of the photo.
   *
   * This property is required and must be a valid URL string. It is validated
   * using class-validator decorators to ensure that it is not empty and is of
   * the correct type.
   */
  @ApiProperty({ description: 'The URL of the photo' })
  @IsUrl()
  @IsNotEmpty()
  @IsString()
  url: string;

  /**
   * The caption for the photo.
   *
   * This property is optional and must be a string if provided. It is validated
   * using class-validator decorators to ensure that it is of the correct type.
   */
  @ApiPropertyOptional({ description: 'The caption for the photo' })
  @IsOptional()
  @IsString()
  caption?: string;
}
