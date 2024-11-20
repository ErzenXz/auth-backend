import { Injectable } from '@nestjs/common';
import { IHttpContext } from 'src/auth/models';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAlbumDto } from './dtos/create.dto';
import { XCacheService } from 'src/cache/cache.service';
import { UpdateAlbumDto } from './dtos/update.dto';
import { DeleteAlbumDto } from './dtos/delete.dto';

/**
 * Service for managing album collections in the application.
 *
 * This class provides methods to create, retrieve, update, and delete albums
 * using a Prisma service for database interactions and a cache service for
 * optimizing data retrieval. It ensures that user context is validated
 * before performing any operations.
 */
@Injectable()
export class CollectionService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cacheService: XCacheService,
  ) {}

  /**
   * Creates a new album in the database for the authenticated user.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {CreateAlbumDto} createDto - The data transfer object containing album creation details.
   * @returns {Promise<Album>} A promise that resolves to the created album object.
   * @throws {Error} Throws an error if the user is not found in the context.
   */
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

  /**
   * Retrieves all albums for the authenticated user, utilizing cache for efficiency.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @returns {Promise<Album[]>} A promise that resolves to an array of albums.
   * @throws {Error} Throws an error if the user is not found in the context.
   */
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
    return albums;
  }

  /**
   * Updates an existing album for the authenticated user.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {UpdateAlbumDto} updateDto - The data transfer object containing album update details.
   * @returns {Promise<Album>} A promise that resolves to the updated album object.
   * @throws {Error} Throws an error if the user is not found in the context.
   */
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

  /**
   * Deletes an album for the authenticated user.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {DeleteAlbumDto} deleteDto - The data transfer object containing album deletion details.
   * @returns {Promise<void>} A promise that resolves when the album has been deleted.
   * @throws {Error} Throws an error if the user is not found in the context.
   */
  async deleteAlbum(context: IHttpContext, deleteDto: DeleteAlbumDto) {
    const { id: albumId } = deleteDto;
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
