import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class ChangePhotoDto {
  @IsNotEmpty()
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'User new photo',
  })
  photo: any;
}
