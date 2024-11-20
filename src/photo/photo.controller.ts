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

/**
 * Controller for managing photo-related operations in the application.
 *
 * This class provides endpoints for creating, retrieving, updating, and deleting photos,
 * as well as handling operations related to multiple photos and album-specific queries.
 * It utilizes the PhotoService to perform the underlying operations and ensures that
 * all actions are authenticated using the @Auth() decorator.
 */
@ApiTags('Photos')
@Controller({
  path: 'photo',
  version: '1',
})
export class PhotoController {
  constructor(private readonly photoService: PhotoService) {}

  /**
   * Creates a new photo using the provided data.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {CreatePhotoDto} createDto - The data transfer object containing the photo creation details.
   * @returns {Promise<any>} A promise that resolves to the created photo object.
   */
  @Post('create')
  @Auth()
  async create(
    @HttpContext() context: IHttpContext,
    @Body() createDto: CreatePhotoDto,
  ) {
    return this.photoService.createPhoto(context, createDto);
  }

  /**
   * Creates multiple new photos using the provided data.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {CreatePhotoDto[]} createDto - An array of data transfer objects containing the photo creation details.
   * @returns {Promise<any[]>} A promise that resolves to an array of created photo objects.
   */
  @Post('create-multiple')
  @Auth()
  async createMultiple(
    @HttpContext() context: IHttpContext,
    @Body() createDto: CreatePhotoDto[],
  ) {
    return this.photoService.createMultiplePhotos(context, createDto);
  }

  /**
   * Retrieves all photos for the authenticated user.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @returns {Promise<any[]>} A promise that resolves to an array of photos.
   */
  @Get()
  @Auth()
  async getPhotos(@HttpContext() context: IHttpContext) {
    return this.photoService.getPhotos(context);
  }

  /**
   * Updates an existing photo using the provided data.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {UpdatePhotoDto} updateDto - The data transfer object containing the photo update details.
   * @returns {Promise<any>} A promise that resolves to the updated photo object.
   */
  @Put('update')
  @Auth()
  async updatePhoto(
    @HttpContext() context: IHttpContext,
    @Body() updateDto: UpdatePhotoDto,
  ) {
    return this.photoService.updatePhoto(context, updateDto);
  }

  /**
   * Deletes a specific photo using the provided data.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {DeletePhotoDto} deleteDto - The data transfer object containing the photo deletion details.
   * @returns {Promise<any>} A promise that resolves to the result of the deletion operation.
   */
  @Delete('delete')
  @Auth()
  async deletePhoto(
    @HttpContext() context: IHttpContext,
    @Body() deleteDto: DeletePhotoDto,
  ) {
    return this.photoService.deletePhoto(context, deleteDto);
  }

  /**
   * Deletes multiple photos using the provided data.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {DeletePhotoDto[]} deleteDtos - An array of data transfer objects containing the photo deletion details.
   * @returns {Promise<any[]>} A promise that resolves to the results of the deletion operations.
   */
  @Delete('delete-multiple')
  @Auth()
  async deleteMultiplePhotos(
    @HttpContext() context: IHttpContext,
    @Body() deleteDtos: DeletePhotoDto[],
  ) {
    return this.photoService.deleteMultiplePhotos(context, deleteDtos);
  }

  /**
   * Retrieves a specific photo by its ID.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {GetSinglePhotoDto} getDto - The data transfer object containing the photo ID.
   * @returns {Promise<any>} A promise that resolves to the requested photo object.
   */
  @Get(':id')
  @Auth()
  async getPhotoById(
    @HttpContext() context: IHttpContext,
    @Param() getDto: GetSinglePhotoDto,
  ) {
    return this.photoService.getPhotoById(context, getDto);
  }

  /**
   * Retrieves photos by album ID and user ID.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {GetAlbumPhotoDto} getDto - The data transfer object containing the album ID and user ID.
   * @returns {Promise<any[]>} A promise that resolves to an array of photos from the specified album.
   */
  @Get('album/:albumId/user')
  @Auth()
  async getPhotosByAlbumIdAndUserId(
    @HttpContext() context: IHttpContext,
    @Param() getDto: GetAlbumPhotoDto,
  ) {
    return this.photoService.getPhotosByAlbumIdAndUserId(context, getDto);
  }

  /**
   * Retrieves photos by multiple album IDs and user ID.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {GetMultipleAlbumPhotoDto} getDto - The data transfer object containing the album IDs.
   * @returns {Promise<any[]>} A promise that resolves to an array of photos from the specified albums.
   */
  @Post('albums/user')
  @Auth()
  async getPhotosByAlbumIdsAndUserId(
    @HttpContext() context: IHttpContext,
    @Body() getDto: GetMultipleAlbumPhotoDto,
  ) {
    return this.photoService.getPhotosByAlbumIdsAndUserId(context, getDto);
  }
}
