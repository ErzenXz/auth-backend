import { Injectable } from '@nestjs/common';
import { IHttpContext } from 'src/auth/models';
import { XCacheService } from 'src/cache/cache.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreatePhotoDto } from './dto/create.dto';
import { UpdatePhotoDto } from './dto/update.dto';
import { DeletePhotoDto } from './dto/delete.dto';
import { GetSinglePhotoDto } from './dto/get.single.dto';
import { GetAlbumPhotoDto } from './dto/get.album.dto';
import { GetMultipleAlbumPhotoDto } from './dto/get.multiple.dto';

@Injectable()
export class PhotoService {
  constructor(
    private prismaService: PrismaService,
    private cacheService: XCacheService,
  ) {}

  async createPhoto(context: IHttpContext, createDto: CreatePhotoDto) {
    if (!context.user) {
      throw new Error('User not found');
    }

    const photo = await this.prismaService.photo.create({
      data: {
        url: createDto.url,
        caption: createDto.caption,
        userId: context.user.id,
        albums: createDto.albumIds
          ? {
              connect: createDto.albumIds.map((id) => ({ id })),
            }
          : undefined,
      },
      include: {
        albums: true,
      },
    });

    this.cacheService.delCache(`photos:${context.user.id}`);
    if (createDto.albumIds) {
      createDto.albumIds.forEach((albumId) => {
        this.cacheService.delCache(`album:${albumId}`);
      });
    }

    return photo;
  }

  async createMultiplePhotos(
    context: IHttpContext,
    createDtos: CreatePhotoDto[],
  ) {
    if (!context.user) {
      throw new Error('User not found');
    }

    const photos = await this.prismaService.$transaction(
      createDtos.map((dto) =>
        this.prismaService.photo.create({
          data: {
            url: dto.url,
            caption: dto.caption,
            userId: context.user!.id,
            albums: dto.albumIds
              ? {
                  connect: dto.albumIds.map((id) => ({ id })),
                }
              : undefined,
          },
        }),
      ),
    );

    this.cacheService.delCache(`photos:${context.user.id}`);
    const uniqueAlbumIds = new Set(
      createDtos.flatMap((dto) => dto.albumIds || []),
    );
    uniqueAlbumIds.forEach((albumId) => {
      this.cacheService.delCache(`album:${albumId}`);
    });

    return photos;
  }

  async getPhotos(context: IHttpContext) {
    if (!context.user) {
      throw new Error('User not found');
    }

    let photos = await this.cacheService.getCache(`photos:${context.user.id}`);

    if (!photos) {
      console.log('Fetching from database');
      photos = await this.prismaService.photo.findMany({
        where: {
          userId: context.user.id,
        },
      });

      await this.cacheService.setCache(`photos:${context.user.id}`, photos);
    }

    console.log('Fetching from cache');

    return photos;
  }

  async updatePhoto(context: IHttpContext, updateDto: UpdatePhotoDto) {
    if (!context.user) {
      throw new Error('User not found');
    }

    return this.prismaService.photo
      .update({
        where: {
          id: Number(updateDto.id),
          userId: context.user.id,
        },
        data: {
          url: updateDto.url,
          caption: updateDto.caption,
        },
      })
      .then((photo) => {
        this.cacheService.delCache(`photos:${context.user.id}`);
        return photo;
      });
  }

  async deletePhoto(context: IHttpContext, deleteDto: DeletePhotoDto) {
    const { id: photoId } = deleteDto;
    if (!context.user) {
      throw new Error('User not found');
    }

    return this.prismaService.photo
      .delete({
        where: {
          id: photoId,
          userId: context.user.id,
        },
      })
      .then((photo) => {
        this.cacheService.delCache(`photos:${context.user.id}`);
        return photo;
      });
  }

  async deleteMultiplePhotos(
    context: IHttpContext,
    deleteDtos: DeletePhotoDto[],
  ) {
    if (!context.user) {
      throw new Error('User not found');
    }

    return this.prismaService
      .$transaction(
        deleteDtos.map((dto) =>
          this.prismaService.photo.delete({
            where: {
              id: dto.id,
              userId: context.user.id,
            },
          }),
        ),
      )
      .then(() => {
        this.cacheService.delCache(`photos:${context.user.id}`);
        return deleteDtos;
      });
  }

  async getPhotoById(context: IHttpContext, getDto: GetSinglePhotoDto) {
    const { id } = getDto;
    if (!context.user) {
      throw new Error('User not found');
    }

    return this.prismaService.photo.findFirst({
      where: {
        id,
        userId: context.user.id,
      },
    });
  }

  async getPhotosByAlbumId(context: IHttpContext, getDto: GetAlbumPhotoDto) {
    const { albumId } = getDto;
    if (!context.user) {
      throw new Error('User not found');
    }

    return this.prismaService.photo.findMany({
      where: {
        albums: {
          some: {
            id: albumId,
          },
        },
      },
    });
  }

  async getPhotosByAlbumIds(
    context: IHttpContext,
    getDto: GetMultipleAlbumPhotoDto,
  ) {
    const { albumIds } = getDto;

    if (!context.user) {
      throw new Error('User not found');
    }

    return this.prismaService.photo.findMany({
      where: {
        albums: {
          some: {
            id: {
              in: albumIds,
            },
          },
        },
      },
    });
  }

  async getPhotosByAlbumIdAndUserId(
    context: IHttpContext,
    getDto: GetAlbumPhotoDto,
  ) {
    const { albumId } = getDto;
    if (!context.user) {
      throw new Error('User not found');
    }

    return this.prismaService.photo.findMany({
      where: {
        albums: {
          some: {
            id: albumId,
          },
        },
        userId: context.user.id,
      },
    });
  }

  async getPhotosByAlbumIdsAndUserId(
    context: IHttpContext,
    getDto: GetMultipleAlbumPhotoDto,
  ) {
    const { albumIds } = getDto;
    if (!context.user) {
      throw new Error('User not found');
    }

    return this.prismaService.photo.findMany({
      where: {
        albums: {
          some: {
            id: {
              in: albumIds,
            },
          },
        },
        userId: context.user.id,
      },
    });
  }
}
