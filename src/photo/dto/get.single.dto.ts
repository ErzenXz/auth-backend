import { IsInt, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetSinglePhotoDto {
  @ApiProperty({ description: 'The unique identifier of the photo' })
  @IsInt()
  @IsNotEmpty()
  id: number;
}
