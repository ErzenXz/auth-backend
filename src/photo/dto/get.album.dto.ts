import { IsInt, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Data Transfer Object (DTO) for retrieving photos from an album.
 *
 * This DTO defines the structure of the request body required to fetch photos
 * from a specific album. It ensures that the album ID is provided and validated
 * before processing the request.
 */
export class GetAlbumPhotoDto {
  /**
   * The ID of the album from which to get the photos.
   *
   * This property is required and must be an integer. It is validated using
   * class-validator decorators to ensure that it is not empty and is of the
   * correct type.
   */
  @ApiProperty({ description: 'The ID of the album which to get the photos' })
  @IsInt()
  @IsNotEmpty()
  albumId: number;
}
