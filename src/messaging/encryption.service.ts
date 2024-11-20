import * as crypto from 'crypto';

/**
 * Service for encrypting and decrypting text using AES-256-CBC algorithm.
 *
 * This class provides methods to securely encrypt and decrypt strings using a secret key
 * derived from an environment variable. It generates a random initialization vector (IV)
 * for each encryption operation to enhance security. The encrypted output includes both
 * the IV and the encrypted content for successful decryption.
 */
export class EncryptionService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly secretKey = crypto
    .createHash('sha256')
    .update(process.env.ENCRYPTION_SECRET_KEY || '')
    .digest();
  private readonly iv = crypto.randomBytes(16);

  /**
   * Encrypts a given text using the AES-256-CBC algorithm.
   *
   * @param {string} text - The plaintext string to be encrypted.
   * @returns {{ iv: string; content: string }} An object containing the initialization vector (IV)
   * and the encrypted content in hexadecimal format.
   */
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

  /**
   * Decrypts an encrypted text using the AES-256-CBC algorithm.
   *
   * @param {string} iv - The initialization vector (IV) used during encryption, in hexadecimal format.
   * @param {string} encryptedText - The encrypted content in hexadecimal format to be decrypted.
   * @returns {string} The decrypted plaintext string.
   */
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
