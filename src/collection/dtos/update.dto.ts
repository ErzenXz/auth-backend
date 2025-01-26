import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Data Transfer Object (DTO) for updating an album.
 *
 * This DTO defines the structure of the request body required to update an album,
 * ensuring that the necessary validation rules are applied to the input data.
 * It includes the album's title and ID, both of which are required for the update operation.
 */
export class UpdateAlbumDto {
  /**
   * The title of the album.
   *
   * This property is required and must be a string. It is validated using class-validator
   * decorators to ensure that it is not empty and is of the correct type.
   */
  @ApiProperty({ description: 'The title of the album' })
  @IsString()
  @IsNotEmpty()
  title: string;

  /**
   * The ID of the album.
   *
   * This property is required and must be a number. It is validated using class-validator
   * decorators to ensure that it is not empty and is of the correct type.
   */
  @ApiProperty({ description: 'The ID of the album' })
  @IsString()
  @IsNotEmpty()
  id: string;
}
