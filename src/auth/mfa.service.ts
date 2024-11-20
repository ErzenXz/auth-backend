import { Injectable } from '@nestjs/common';
import * as qrcode from 'qrcode';
import { authenticator } from 'otplib';
import { randomBytes } from 'crypto';

/**
 * Service for managing multi-factor authentication (MFA) functionalities.
 *
 * This service provides methods for generating TOTP secrets, creating QR codes for
 * MFA setup, verifying TOTP tokens, and generating backup codes for users. It utilizes
 * the `otplib` library for TOTP generation and `qrcode` for QR code creation.
 */
@Injectable()
export class MfaService {
  /**
   * Generates a TOTP secret for a user.
   *
   * @returns A string representing the generated TOTP secret.
   */
  generateTotpSecret(): string {
    return authenticator.generateSecret();
  }

  /**
   * Generates a URI for the QR code used in MFA setup.
   *
   * @param username - The username of the user for whom the QR code is generated.
   * @param secret - The TOTP secret associated with the user.
   * @returns A string representing the OTP Auth URI for the QR code.
   */
  generateQrCodeUri(username: string, secret: string): string {
    return (
      authenticator.keyuri(username, 'XENSystem', secret) +
      '&image=https://auth.erzen.xyz/src/content/favicon.svg'
    );
  }

  /**
   * Generates a QR code image from the provided OTP Auth URI.
   *
   * @param otpauth - The OTP Auth URI to convert into a QR code image.
   * @returns A promise that resolves to a Buffer containing the QR code image.
   */
  async generateQrCodeImage(otpauth: string): Promise<Buffer> {
    return await qrcode.toBuffer(otpauth);
  }

  /**
   * Verifies a TOTP token against the user's TOTP secret.
   *
   * @param token - The TOTP token provided by the user.
   * @param secret - The TOTP secret associated with the user.
   * @returns A boolean indicating whether the token is valid.
   */
  verifyTotp(token: string, secret: string): boolean {
    return authenticator.verify({ token, secret });
  }

  /**
   * Generates a set of backup codes for the user.
   *
   * @returns A string containing 10 randomly generated backup codes, separated by commas.
   */
  generateBackupCodes(): string {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      codes.push(randomBytes(4).toString('hex'));
    }
    return codes.join(',');
  }
}
