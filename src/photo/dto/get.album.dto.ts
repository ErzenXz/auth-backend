import { IsInt, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetAlbumPhotoDto {
  @ApiProperty({ description: 'The ID of the album which to get the photos' })
  @IsInt()
  @IsNotEmpty()
  albumId: number;
}
