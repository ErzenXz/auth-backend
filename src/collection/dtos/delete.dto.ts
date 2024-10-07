import { IsNotEmpty, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteAlbumDto {
  @ApiProperty({ description: 'The ID of the album to delete' })
  @IsNumber()
  @IsNotEmpty()
  id: number;
}
