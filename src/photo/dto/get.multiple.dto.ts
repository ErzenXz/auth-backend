import { IsArray, IsInt, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetMultipleAlbumPhotoDto {
  @ApiProperty({
    type: [Number],
    description: 'Array of album IDs to get the photos from',
  })
  @IsArray()
  @IsNotEmpty()
  albumIds: number[];
}
