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

/**
 * Service for managing photo-related operations in the application.
 *
 * This class provides methods to create, retrieve, update, and delete photos,
 * as well as handle operations related to albums. It utilizes Prisma for database
 * interactions and a caching service to optimize data retrieval and storage.
 */
@Injectable()
export class PhotoService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cacheService: XCacheService,
  ) {}

  /**
   * Creates a new photo using the provided data.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {CreatePhotoDto} createDto - The data transfer object containing the photo creation details.
   * @returns {Promise<any>} A promise that resolves to the created photo object.
   * @throws {Error} Throws an error if the user is not found.
   */
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

  /**
   * Creates multiple new photos using the provided data.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {CreatePhotoDto[]} createDtos - An array of data transfer objects containing the photo creation details.
   * @returns {Promise<any[]>} A promise that resolves to an array of created photo objects.
   * @throws {Error} Throws an error if the user is not found.
   */
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

  /**
   * Retrieves all photos for the authenticated user.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @returns {Promise<any[]>} A promise that resolves to an array of photos.
   * @throws {Error} Throws an error if the user is not found.
   */
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

  /**
   * Updates an existing photo using the provided data.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {UpdatePhotoDto} updateDto - The data transfer object containing the photo update details.
   * @returns {Promise<any>} A promise that resolves to the updated photo object.
   * @throws {Error} Throws an error if the user is not found.
   */
  async updatePhoto(context: IHttpContext, updateDto: UpdatePhotoDto) {
    if (!context.user) {
      throw new Error('User not found');
    }

    return this.prismaService.photo
      .update({
        where: {
          id: updateDto.id,
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

  /**
   * Deletes a specific photo using the provided data.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {DeletePhotoDto} deleteDto - The data transfer object containing the photo deletion details.
   * @returns {Promise<any>} A promise that resolves to the deleted photo object.
   * @throws {Error} Throws an error if the user is not found.
   */
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

  /**
   * Deletes multiple photos using the provided data.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {DeletePhotoDto[]} deleteDtos - An array of data transfer objects containing the photo deletion details.
   * @returns {Promise<DeletePhotoDto[]>} A promise that resolves to the deleted photo DTOs.
   * @throws {Error} Throws an error if the user is not found.
   */
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

  /**
   * Retrieves a specific photo by its ID.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {GetSinglePhotoDto} getDto - The data transfer object containing the photo ID.
   * @returns {Promise<any>} A promise that resolves to the requested photo object.
   * @throws {Error} Throws an error if the user is not found.
   */
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

  /**
   * Retrieves photos by album ID.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {GetAlbumPhotoDto} getDto - The data transfer object containing the album ID.
   * @returns {Promise<any[]>} A promise that resolves to an array of photos from the specified album.
   * @throws {Error} Throws an error if the user is not found.
   */
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

  /**
   * Retrieves photos by multiple album IDs.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {GetMultipleAlbumPhotoDto} getDto - The data transfer object containing the album IDs.
   * @returns {Promise<any[]>} A promise that resolves to an array of photos from the specified albums.
   * @throws {Error} Throws an error if the user is not found.
   */
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

  /**
   * Retrieves photos by album ID and user ID.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {GetAlbumPhotoDto} getDto - The data transfer object containing the album ID.
   * @returns {Promise<any[]>} A promise that resolves to an array of photos from the specified album for the user.
   * @throws {Error} Throws an error if the user is not found.
   */
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

  /**
   * Retrieves photos by multiple album IDs and user ID.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {GetMultipleAlbumPhotoDto} getDto - The data transfer object containing the album IDs.
   * @returns {Promise<any[]>} A promise that resolves to an array of photos from the specified albums for the user.
   * @throws {Error} Throws an error if the user is not found.
   */
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
