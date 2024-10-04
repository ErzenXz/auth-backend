import { Injectable } from '@nestjs/common';
import * as qrcode from 'qrcode';
import { authenticator } from 'otplib';
import { randomBytes } from 'crypto';

@Injectable()
export class MfaService {
  generateTotpSecret(): string {
    return authenticator.generateSecret();
  }

  generateQrCodeUri(username: string, secret: string): string {
    return authenticator.keyuri(username, 'YourAppName', secret);
  }

  async generateQrCodeImage(otpauth: string): Promise<Buffer> {
    return await qrcode.toBuffer(otpauth);
  }

  verifyTotp(token: string, secret: string): boolean {
    return authenticator.verify({ token, secret });
  }

  generateBackupCodes(): string {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      codes.push(randomBytes(4).toString('hex'));
    }
    return codes.join(',');
  }
}
