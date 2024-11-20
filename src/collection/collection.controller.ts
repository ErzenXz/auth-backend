import { Body, Controller, Delete, Get, Post, Put } from '@nestjs/common';
import { Auth, HttpContext } from 'src/auth/decorators';
import type { HttpContext as IHttpContext } from '../auth/models/http.model';
import { CreateAlbumDto } from './dtos/create.dto';
import { CollectionService } from './collection.service';
import { UpdateAlbumDto } from './dtos/update.dto';
import { DeleteAlbumDto } from './dtos/delete.dto';
import { ApiTags } from '@nestjs/swagger';

/**
 * Controller for managing album collections in the application.
 *
 * This class provides endpoints for creating, updating, deleting, and listing albums.
 * It utilizes the CollectionService to perform the underlying operations and ensures
 * that all actions are authenticated using the @Auth() decorator.
 */
@ApiTags('Collections')
@Controller({
  path: 'collection',
  version: '1',
})
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

  /**
   * Creates a new album using the provided data.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata.
   * @param {CreateAlbumDto} createDto - The data transfer object containing album creation details.
   * @returns {Promise<any>} A promise that resolves to the created album data.
   */
  @Post('create')
  @Auth()
  async create(
    @HttpContext() context: IHttpContext,
    @Body() createDto: CreateAlbumDto,
  ) {
    return this.collectionService.create(context, createDto);
  }

  /**
   * Updates an existing album with the provided data.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata.
   * @param {UpdateAlbumDto} updateDto - The data transfer object containing album update details.
   * @returns {Promise<any>} A promise that resolves to the updated album data.
   */
  @Put('update')
  @Auth()
  async update(
    @HttpContext() context: IHttpContext,
    @Body() updateDto: UpdateAlbumDto,
  ) {
    return this.collectionService.updateAlbum(context, updateDto);
  }

  /**
   * Deletes an album specified by the provided data.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata.
   * @param {DeleteAlbumDto} deleteDto - The data transfer object containing album deletion details.
   * @returns {Promise<any>} A promise that resolves to the result of the deletion operation.
   */
  @Delete('delete')
  @Auth()
  async delete(
    @HttpContext() context: IHttpContext,
    @Body() deleteDto: DeleteAlbumDto,
  ) {
    return this.collectionService.deleteAlbum(context, deleteDto);
  }

  /**
   * Retrieves a list of albums for the authenticated user.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata.
   * @returns {Promise<any>} A promise that resolves to an array of albums.
   */
  @Get('list')
  @Auth()
  async getMy(@HttpContext() context: IHttpContext) {
    return this.collectionService.getAlbums(context);
  }
}
