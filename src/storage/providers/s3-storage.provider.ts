import { Injectable } from '@nestjs/common';
import * as AWS from 'aws-sdk';
import { StorageProvider, UploadProgress } from '../storage-provider.interface';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import * as crypto from 'crypto';

/**
 * A storage provider implementation for uploading files to AWS S3.
 *
 * This class utilizes the AWS SDK to manage file uploads to an S3 bucket.
 * It provides methods for uploading files as streams and tracking upload progress,
 * including estimated time of arrival (ETA) for the upload completion.
 * The configuration for AWS credentials and bucket details is managed through
 * a configuration service.
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly AWS_S3_BUCKET: string;
  private readonly s3: AWS.S3;

  constructor(private readonly configService: ConfigService) {
    this.AWS_S3_BUCKET = configService.get<string>('S3_BUCKET');
    this.s3 = new AWS.S3({
      accessKeyId: configService.get<string>('S3_ACCESS_KEY'),
      secretAccessKey: configService.get<string>('S3_SECRET_KEY'),
    });
  }

  /**
   * Uploads a file stream to the S3 bucket.
   *
   * @param {Express.Multer.File} file - The file object containing the file data to be uploaded.
   * @returns {Readable} A readable stream that emits upload progress and completion events.
   */
  uploadFileStream(file: Express.Multer.File): Readable {
    const { originalname, buffer, mimetype } = file;
    return this.s3Upload(buffer, this.AWS_S3_BUCKET, originalname, mimetype);
  }

  /**
   * Handles the S3 upload process and tracks progress.
   *
   * @param {Buffer} file - The file buffer to be uploaded.
   * @param {string} bucket - The name of the S3 bucket.
   * @param {string} name - The original name of the file.
   * @param {string} mimetype - The MIME type of the file.
   * @returns {Readable} A readable stream that emits upload progress and completion events.
   */
  private s3Upload(
    file: Buffer,
    bucket: string,
    name: string,
    mimetype: string,
  ): Readable {
    const fileKey = crypto.randomBytes(32).toString('hex');

    const params = {
      Bucket: bucket,
      Key: fileKey,
      Body: file,
      ACL: 'public-read',
      ContentType: mimetype,
      ContentDisposition: 'inline',
      CreateBucketConfiguration: {
        LocationConstraint: this.configService.get<string>('S3_REGION'),
      },
    };

    const managedUpload = this.s3.upload(params);
    const pass = new Readable({ objectMode: true });
    pass._read = () => {};

    const startTime = Date.now();

    managedUpload.on('httpUploadProgress', (progress) => {
      const currentTime = Date.now();
      const elapsedTime = (currentTime - startTime) / 1000; // in seconds
      const uploadSpeed = progress.loaded / elapsedTime; // bytes per second
      const remainingBytes = progress.total - progress.loaded;
      const etaSeconds = remainingBytes / uploadSpeed;

      const uploadProgress: UploadProgress = {
        percentage: Math.round((progress.loaded / progress.total) * 100),
        uploadedBytes: progress.loaded,
        totalBytes: progress.total,
        eta: this.formatETA(etaSeconds),
      };

      pass.push(JSON.stringify(uploadProgress));
    });

    managedUpload
      .promise()
      .then((data) => {
        // Send the final progress update with the S3 URL
        const finalUpdate = {
          percentage: 100,
          uploadedBytes: file.length,
          totalBytes: file.length,
          eta: '00:00:00',
          url: data.Location,
        };
        pass.push(JSON.stringify(finalUpdate));
        pass.push(null); // End the stream
      })
      .catch((error) => {
        pass.emit('error', error);
      });

    return pass;
  }

  /**
   * Formats the estimated time of arrival (ETA) for the upload.
   *
   * @param {number} seconds - The number of seconds until completion.
   * @returns {string} A formatted string representing the ETA in HH:MM:SS format.
   */
  private formatETA(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}
