import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { Auth, HttpContext } from 'src/auth/decorators';
import type { HttpContext as IHttpContext } from '../auth/models/http.model';
import { CreateAlbumDto } from './dtos/create.dto';
import { CollectionService } from './collection.service';
import { AppService } from 'src/app.service';
import { UpdateAlbumDto } from './dtos/update.dto';

@Controller({
  path: 'collection',
  version: '1',
})
export class CollectionController {
  constructor(
    private collectionService: CollectionService,
    private appService: AppService,
  ) {}

  @Post('create')
  @Auth()
  async create(
    @HttpContext() context: IHttpContext,
    @Body() createDto: CreateAlbumDto,
  ) {
    return this.collectionService.create(context, createDto);
  }

  @Put('update')
  @Auth()
  async update(
    @HttpContext() context: IHttpContext,
    @Body() updateDto: UpdateAlbumDto,
  ) {
    return this.collectionService.updateAlbum(context, updateDto);
  }

  @Get('my')
  @Auth()
  async getMy(@HttpContext() context: IHttpContext) {
    return this.collectionService.getAlbums(context);
  }
}
