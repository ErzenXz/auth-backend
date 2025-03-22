import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class CredentialManagerService {
  private readonly encryptionKey: string;
  private readonly algorithm = 'aes-256-gcm';

  constructor(private readonly prisma: PrismaService) {
    // In a production environment, this should be loaded from environment variables
    // or a secure key management service like AWS KMS
    this.encryptionKey =
      process.env.CREDENTIAL_ENCRYPTION_KEY ||
      'default-encryption-key-for-development-only';
  }

  /**
   * Store an encrypted credential in the database
   */
  async storeCredential(
    userId: string,
    agentId: string,
    name: string,
    value: string,
    type: string,
  ): Promise<void> {
    const encryptedValue = this.encrypt(value);

    await this.prisma.agentCredential.upsert({
      where: {
        agentId_name: {
          agentId,
          name,
        },
      },
      update: {
        value: encryptedValue,
        type,
      },
      create: {
        name,
        type,
        value: encryptedValue,
        agent: {
          connect: { id: agentId },
        },
      },
    });
  }

  /**
   * Retrieve and decrypt a credential
   */
  async getCredential(agentId: string, name: string): Promise<string> {
    const credential = await this.prisma.agentCredential.findUnique({
      where: {
        agentId_name: {
          agentId,
          name,
        },
      },
    });

    if (!credential) {
      throw new Error(`Credential "${name}" not found for agent ${agentId}`);
    }

    return this.decrypt(credential.value);
  }

  /**
   * Delete a credential
   */
  async deleteCredential(agentId: string, credentialId: string): Promise<void> {
    await this.prisma.agentCredential.delete({
      where: { id: credentialId },
    });
  }

  /**
   * List all credential names (without values) for an agent
   */
  async listCredentials(
    agentId: string,
  ): Promise<{ id: string; name: string; type: string }[]> {
    const credentials = await this.prisma.agentCredential.findMany({
      where: { agentId },
      select: {
        id: true,
        name: true,
        type: true,
      },
    });

    return credentials;
  }

  /**
   * Encrypt a value using AES-256-GCM
   */
  private encrypt(text: string): string {
    // Create a random initialization vector
    const iv = crypto.randomBytes(16);

    // Create a cipher using the encryption key and iv
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    // Encrypt the text
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get the authentication tag
    const authTag = cipher.getAuthTag();

    // Return iv, encrypted data, and auth tag as a single string
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt a value using AES-256-GCM
   */
  private decrypt(encryptedText: string): string {
    // Split the encrypted text into its components
    const [ivHex, authTagHex, encryptedData] = encryptedText.split(':');

    // Convert hex strings back to buffers
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    // Create a decipher using the encryption key and iv
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);

    // Set the auth tag
    decipher.setAuthTag(authTag);

    // Decrypt the data
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
