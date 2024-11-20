import { IsInt, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Data Transfer Object (DTO) for deleting a photo.
 *
 * This DTO defines the structure of the request body required to delete a photo,
 * ensuring that the necessary validation rules are applied to the input data.
 * It includes the ID of the photo that needs to be deleted.
 */
export class DeletePhotoDto {
  /**
   * ID of the photo to be deleted.
   *
   * This property is required and must be an integer. It is validated using class-validator
   * decorators to ensure that it is not empty and is of the correct type.
   */
  @ApiProperty({ description: 'ID of the photo to be deleted' })
  @IsInt()
  @IsNotEmpty()
  id: number;
}
