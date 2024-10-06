import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class UpdateAlbumDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsNumber()
  @IsNotEmpty()
  id: number;
}
