import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { S3StorageProvider } from './providers/s3-storage.provider';
import { STORAGE_PROVIDER } from './storage-provider.interface';
import { StorageController } from './storage.controller';

@Module({
  providers: [
    StorageService,
    {
      provide: STORAGE_PROVIDER,
      useClass: S3StorageProvider,
    },
  ],
  controllers: [StorageController],
  exports: [StorageService],
})
export class StorageModule {}
