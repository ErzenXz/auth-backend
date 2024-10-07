import { IsInt, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeletePhotoDto {
  @ApiProperty({ description: 'ID of the photo to be deleted' })
  @IsInt()
  @IsNotEmpty()
  id: number;
}
