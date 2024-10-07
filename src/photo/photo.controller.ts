import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Delete,
} from '@nestjs/common';
import { PhotoService } from './photo.service';
import { Auth, HttpContext } from 'src/auth/decorators';
import { IHttpContext } from 'src/auth/models';
import { CreatePhotoDto } from './dto/create.dto';
import { UpdatePhotoDto } from './dto/update.dto';
import { DeletePhotoDto } from './dto/delete.dto';
import { GetSinglePhotoDto } from './dto/get.single.dto';
import { GetAlbumPhotoDto } from './dto/get.album.dto';
import { GetMultipleAlbumPhotoDto } from './dto/get.multiple.dto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Photos')
@Controller({
  path: 'photo',
  version: '1',
})
export class PhotoController {
  constructor(private photoService: PhotoService) {}

  @Post('create')
  @Auth()
  async create(
    @HttpContext() context: IHttpContext,
    @Body() createDto: CreatePhotoDto,
  ) {
    return this.photoService.createPhoto(context, createDto);
  }

  @Post('create-multiple')
  @Auth()
  async createMultiple(
    @HttpContext() context: IHttpContext,
    @Body() createDto: CreatePhotoDto[],
  ) {
    return this.photoService.createMultiplePhotos(context, createDto);
  }

  @Get()
  @Auth()
  async getPhotos(@HttpContext() context: IHttpContext) {
    return this.photoService.getPhotos(context);
  }

  @Put('update')
  @Auth()
  async updatePhoto(
    @HttpContext() context: IHttpContext,
    @Body() updateDto: UpdatePhotoDto,
  ) {
    return this.photoService.updatePhoto(context, updateDto);
  }

  @Delete('delete')
  @Auth()
  async deletePhoto(
    @HttpContext() context: IHttpContext,
    @Body() deleteDto: DeletePhotoDto,
  ) {
    return this.photoService.deletePhoto(context, deleteDto);
  }

  @Delete('delete-multiple')
  @Auth()
  async deleteMultiplePhotos(
    @HttpContext() context: IHttpContext,
    @Body() deleteDtos: DeletePhotoDto[],
  ) {
    return this.photoService.deleteMultiplePhotos(context, deleteDtos);
  }

  @Get(':id')
  @Auth()
  async getPhotoById(
    @HttpContext() context: IHttpContext,
    @Param() getDto: GetSinglePhotoDto,
  ) {
    return this.photoService.getPhotoById(context, getDto);
  }

  @Get('album/:albumId/user')
  @Auth()
  async getPhotosByAlbumIdAndUserId(
    @HttpContext() context: IHttpContext,
    @Param() getDto: GetAlbumPhotoDto,
  ) {
    return this.photoService.getPhotosByAlbumIdAndUserId(context, getDto);
  }

  @Post('albums/user')
  @Auth()
  async getPhotosByAlbumIdsAndUserId(
    @HttpContext() context: IHttpContext,
    @Body() getDto: GetMultipleAlbumPhotoDto,
  ) {
    return this.photoService.getPhotosByAlbumIdsAndUserId(context, getDto);
  }
}
