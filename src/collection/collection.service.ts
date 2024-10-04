import { Injectable } from '@nestjs/common';
import { IHttpContext } from 'src/auth/models';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAlbumDto } from './dtos/create.dto';

@Injectable()
export class CollectionService {
  constructor(private prismaService: PrismaService) {}

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

    return album;
  }

  async getAlbums(context: IHttpContext) {
    if (!context.user) {
      throw new Error('User not found');
    }

    return this.prismaService.album.findMany({
      where: {
        userId: context.user.id,
      },
    });
  }

  async getAlbumById(context: IHttpContext, albumId: string) {
    if (!context.user) {
      throw new Error('User not found');
    }

    return this.prismaService.album.findFirst({
      where: {
        id: Number(albumId),
        userId: context.user.id,
      },
    });
  }

  async updateAlbum(
    context: IHttpContext,
    albumId: string,
    updateDto: CreateAlbumDto,
  ) {
    if (!context.user) {
      throw new Error('User not found');
    }

    return this.prismaService.album.update({
      where: {
        id: Number(albumId),
        userId: context.user.id,
      },
      data: {
        title: updateDto.title,
      },
    });
  }

  async deleteAlbum(context: IHttpContext, albumId: string) {
    if (!context.user) {
      throw new Error('User not found');
    }

    return this.prismaService.album.delete({
      where: {
        id: Number(albumId),
        userId: context.user.id,
      },
    });
  }
}
