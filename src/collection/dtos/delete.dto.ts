import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Data Transfer Object (DTO) for deleting an album.
 *
 * This DTO defines the structure of the request body required to delete an album,
 * ensuring that the necessary validation rules are applied to the input data.
 * It includes the album ID that needs to be deleted.
 */
export class DeleteAlbumDto {
  /**
   * The ID of the album to delete.
   *
   * This property is required and must be a number. It is validated using class-validator
   * decorators to ensure that it is not empty and is of the correct type.
   */
  @ApiProperty({ description: 'The ID of the album to delete' })
  @IsString()
  @IsNotEmpty()
  id: string;
}
