import { Inject, Injectable } from '@nestjs/common';
import {
  StorageProvider,
  STORAGE_PROVIDER,
} from './storage-provider.interface';
import { Readable } from 'stream';

@Injectable()
export class StorageService {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storageProvider: StorageProvider,
  ) {}

  uploadFileStream(file: Express.Multer.File): Readable {
    return this.storageProvider.uploadFileStream(file);
  }
}
