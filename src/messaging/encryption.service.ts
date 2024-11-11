import * as crypto from 'crypto';

export class EncryptionService {
  private algorithm = 'aes-256-cbc';
  private secretKey = crypto
    .createHash('sha256')
    .update(process.env.ENCRYPTION_SECRET_KEY || '')
    .digest();
  private iv = crypto.randomBytes(16);

  encrypt(text: string): { iv: string; content: string } {
    const cipher = crypto.createCipheriv(
      this.algorithm,
      Buffer.from(this.secretKey),
      this.iv,
    );
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return { iv: this.iv.toString('hex'), content: encrypted };
  }

  decrypt(iv: string, encryptedText: string): string {
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      Buffer.from(this.secretKey),
      Buffer.from(iv, 'hex'),
    );
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
