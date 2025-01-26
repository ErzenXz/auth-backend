import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PRIVACY_SETTINGS } from './constants';

/**
 * Service for managing user privacy settings in the application.
 *
 * This class provides methods to initialize, retrieve, create, update, and delete
 * privacy settings for users. It interacts with the Prisma ORM to perform database
 * operations and ensures that user existence is validated before performing any
 * operations. It also handles default settings initialization and merging of
 * existing settings with new updates.
 */
@Injectable()
export class PrivacyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Initializes default privacy settings for a user.
   *
   * @param {number} userId - The ID of the user for whom to initialize settings.
   * @returns {Promise<any>} A promise that resolves to the user's privacy settings.
   * @throws {NotFoundException} Throws an exception if the user is not found.
   */
  async initializeDefaultSettings(userId: string) {
    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        UserPrivaySettings: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (user.UserPrivaySettings.length > 0) {
      return user.UserPrivaySettings;
    }

    await this.prisma.userPrivaySettings.create({
      data: {
        userId,
        settings: DEFAULT_PRIVACY_SETTINGS,
      },
    });

    return DEFAULT_PRIVACY_SETTINGS;
  }

  /**
   * Validates the existence of a user by their ID.
   *
   * @param {number} userId - The ID of the user to validate.
   * @returns {Promise<any>} A promise that resolves to the user object if found.
   * @throws {NotFoundException} Throws an exception if the user is not found.
   */
  private async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    return user;
  }

  /**
   * Retrieves the privacy settings for a user.
   *
   * @param {number} userId - The ID of the user whose settings are to be retrieved.
   * @returns {Promise<any>} A promise that resolves to the user's privacy settings.
   * @throws {NotFoundException} Throws an exception if the privacy settings are not found.
   */
  async getPrivacySettings(userId: string) {
    const settings = await this.prisma.userPrivaySettings.findFirst({
      where: { userId: userId },
    });

    if (!settings) {
      throw new NotFoundException('Privacy settings not found');
    }

    return settings;
  }

  /**
   * Creates new privacy settings for a user.
   *
   * @param {number} userId - The ID of the user for whom to create settings.
   * @param {any} settings - The privacy settings to be created.
   * @returns {Promise<any>} A promise that resolves to the created privacy settings.
   * @throws {Error} Throws an error if privacy settings already exist for the user.
   * @throws {NotFoundException} Throws an exception if the user is not found.
   */
  async createPrivacySettings(userId: string, settings: any) {
    await this.validateUser(userId);

    // Check if settings already exist
    const existingSettings = await this.prisma.userPrivaySettings.findFirst({
      where: { userId: userId },
    });

    if (existingSettings) {
      throw new Error('Privacy settings already exist for this user');
    }

    // Add timestamps to settings
    const settingsWithTimestamps = {
      ...settings,
      timestamps: {
        lastUpdated: new Date().toISOString(),
        lastReviewed: new Date().toISOString(),
      },
      version: '1.0',
    };

    return await this.prisma.userPrivaySettings.create({
      data: {
        userId,
        settings: settingsWithTimestamps,
      },
    });
  }

  /**
   * Updates existing privacy settings for a user.
   *
   * @param {number} userId - The ID of the user whose settings are to be updated.
   * @param {any} newSettings - The new privacy settings to be applied.
   * @returns {Promise<any>} A promise that resolves to the updated privacy settings.
   * @throws {NotFoundException} Throws an exception if the user or existing settings are not found.
   */
  async updatePrivacySettings(userId: string, newSettings: any) {
    await this.validateUser(userId);

    // Get existing settings
    const existingSettings = await this.prisma.userPrivaySettings.findFirst({
      where: { userId: userId },
    });

    if (!existingSettings) {
      throw new NotFoundException('Privacy settings not found');
    }

    // Merge existing settings with new settings and update timestamps
    const mergedSettings = {
      ...(typeof existingSettings.settings === 'object'
        ? existingSettings.settings
        : {}),
      ...newSettings,
      timestamps: {
        lastUpdated: new Date().toISOString(),
        lastReviewed: (existingSettings.settings as any).timestamps
          ?.lastReviewed,
      },
    };

    return await this.prisma.userPrivaySettings.update({
      where: {
        id: existingSettings.id,
        userId: userId,
      },
      data: {
        settings: mergedSettings,
        updatedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Deletes the privacy settings for a user.
   *
   * @param {number} userId - The ID of the user whose settings are to be deleted.
   * @returns {Promise<any>} A promise that resolves to the result of the deletion operation.
   * @throws {NotFoundException} Throws an exception if the user or settings are not found.
   */
  async deletePrivacySettings(userId: string) {
    await this.validateUser(userId);

    const settings = await this.prisma.userPrivaySettings.findFirst({
      where: { userId: userId },
    });

    if (!settings) {
      throw new NotFoundException('Privacy settings not found');
    }

    return await this.prisma.userPrivaySettings.delete({
      where: { id: userId },
    });
  }
}
