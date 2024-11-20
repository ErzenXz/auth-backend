import { Inject, Injectable } from '@nestjs/common';
import {
  StorageProvider,
  STORAGE_PROVIDER,
} from './storage-provider.interface';
import { Readable } from 'stream';

/**
 * Service for managing file storage operations.
 *
 * This service provides methods for uploading files to a specified storage provider.
 * It utilizes dependency injection to access the storage provider implementation,
 * allowing for flexibility in storage solutions.
 */
@Injectable()
export class StorageService {
  /**
   * Constructs the StorageService with the specified storage provider.
   *
   * @param storageProvider - The storage provider implementation injected via
   * the STORAGE_PROVIDER token.
   */
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
  ) {}

  /**
   * Uploads a file stream to the storage provider.
   *
   * @param file - The file to be uploaded, represented as an Express Multer file.
   * @returns A Readable stream representing the uploaded file.
   */
  uploadFileStream(file: Express.Multer.File): Readable {
    return this.storageProvider.uploadFileStream(file);
  }
}
