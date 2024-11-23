import {
  Controller,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { StorageService } from './storage.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';

/**
 * Controller for handling file upload operations.
 *
 * This class provides an endpoint for uploading files to a storage service.
 * It utilizes the FileInterceptor to handle file uploads and streams the upload
 * progress back to the client using Server-Sent Events (SSE). The response headers
 * are set to maintain a persistent connection for real-time updates during the upload process.
 */
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  /**
   * Uploads a file and streams the upload progress to the client.
   *
   * @param {Express.Multer.File} file - The uploaded file object containing file data.
   * @param {Response} res - The HTTP response object used to send updates to the client.
   * @returns {Promise<void>} A promise that resolves when the upload process is complete.
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
  ) {
    if (!file) {
      res.status(400).json({
        error:
          'File is required. Please provide a file in multipart/form-data format with field name "file"',
      });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const uploadStream = this.storageService.uploadFileStream(file);

    uploadStream.on('data', (chunk) => {
      res.write(`data: ${chunk}\n\n`);
    });

    uploadStream.on('end', () => {
      res.end();
    });

    uploadStream.on('error', (error) => {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    });
  }
}
