import { Readable } from 'stream';

export interface UploadProgress {
  percentage: number;
  uploadedBytes: number;
  totalBytes: number;
  eta: string;
}

export interface StorageProvider {
  uploadFileStream(file: Express.Multer.File): Readable;
}

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
