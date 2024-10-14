import { Injectable } from '@nestjs/common';
import * as AWS from 'aws-sdk';
import { StorageProvider, UploadProgress } from '../storage-provider.interface';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
const crypto = require('crypto');

@Injectable()
export class S3StorageProvider implements StorageProvider {
  private AWS_S3_BUCKET: string;
  private readonly s3: AWS.S3;

  constructor(private configService: ConfigService) {
    this.AWS_S3_BUCKET = configService.get<string>('S3_BUCKET');
    this.s3 = new AWS.S3({
      accessKeyId: configService.get<string>('S3_ACCESS_KEY'),
      secretAccessKey: configService.get<string>('S3_SECRET_KEY'),
    });
  }

  uploadFileStream(file: Express.Multer.File): Readable {
    const { originalname, buffer, mimetype } = file;
    return this.s3Upload(buffer, this.AWS_S3_BUCKET, originalname, mimetype);
  }

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

    let startTime = Date.now();
    let lastLoaded = 0;

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

      lastLoaded = progress.loaded;
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

  private formatETA(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}
