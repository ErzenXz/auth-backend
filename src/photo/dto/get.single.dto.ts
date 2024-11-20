import { IsInt, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Data Transfer Object (DTO) for retrieving a single photo.
 *
 * This DTO defines the structure of the request body required to fetch a specific
 * photo by its unique identifier. It ensures that the photo ID is provided and
 * validated before processing the request.
 */
export class GetSinglePhotoDto {
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
}
