import { Body, Controller, Post } from '@nestjs/common';
import { Auth, HttpContext } from 'src/auth/decorators';
import type { HttpContext as IHttpContext } from '../auth/models/http.model';
import { CreateAlbumDto } from './dtos/create.dto';
import { CollectionService } from './collection.service';

@Controller('collection')
export class CollectionController {
  constructor(private collectionService: CollectionService) {}

  @Post('create')
  @Auth()
  async create(
    @HttpContext() context: IHttpContext,
    @Body() createDto: CreateAlbumDto,
  ) {
    return this.collectionService.create(context, createDto);
  }
}
