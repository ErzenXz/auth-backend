import { Injectable } from '@nestjs/common';
import { IHttpContext } from 'src/auth/models';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAlbumDto } from './dtos/create.dto';
import { XCacheService } from 'src/cache/cache.service';
import { UpdateAlbumDto } from './dtos/update.dto';

@Injectable()
export class CollectionService {
  constructor(
    private prismaService: PrismaService,
    private cacheService: XCacheService,
  ) {}

  async create(context: IHttpContext, createDto: CreateAlbumDto) {
    // Create album in the database

    if (!context.user) {
      throw new Error('User not found');
    }

    const album = await this.prismaService.album.create({
      data: {
        title: createDto.title,
        userId: context.user.id,
      },
    });

    this.cacheService.delCache(`albums:${context.user.id}`);

    return album;
  }

  async getAlbums(context: IHttpContext) {
    if (!context.user) {
      throw new Error('User not found');
    }

    let albums = await this.cacheService.getCache(`albums:${context.user.id}`);

    if (!albums) {
      console.log('Fetching from database');
      albums = await this.prismaService.album.findMany({
        where: {
          userId: context.user.id,
        },
      });

      await this.cacheService.setCache(`albums:${context.user.id}`, albums);
    }

    console.log('Fetching from cache');

    return albums;
  }

  async updateAlbum(context: IHttpContext, updateDto: UpdateAlbumDto) {
    if (!context.user) {
      throw new Error('User not found');
    }

    return this.prismaService.album
      .update({
        where: {
          id: Number(updateDto.id),
          userId: context.user.id,
        },
        data: {
          title: updateDto.title,
        },
      })
      .then((album) => {
        this.cacheService.delCache(`albums:${context.user.id}`);
        return album;
      });
  }

  async deleteAlbum(context: IHttpContext, albumId: string) {
    if (!context.user) {
      throw new Error('User not found');
    }

    return this.prismaService.album
      .delete({
        where: {
          id: Number(albumId),
          userId: context.user.id,
        },
      })
      .then(() => {
        this.cacheService.delCache(`albums:${context.user.id}`);
      });
  }
}
