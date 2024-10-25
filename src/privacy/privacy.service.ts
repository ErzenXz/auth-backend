import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PRIVACY_SETTINGS } from './constants';

@Injectable()
export class PrivacyService {
  constructor(private prisma: PrismaService) {}

  async initializeDefaultSettings(userId: number) {
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

  private async validateUser(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }
    return user;
  }

  async getPrivacySettings(userId: number) {
    const settings = await this.prisma.userPrivaySettings.findFirst({
      where: { userId: userId },
    });

    if (!settings) {
      throw new NotFoundException('Privacy settings not found');
    }

    return settings;
  }

  async createPrivacySettings(userId: number, settings: any) {
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

  async updatePrivacySettings(userId: number, newSettings: any) {
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
        updatedAt: new Date(),
      },
    });
  }

  async deletePrivacySettings(userId: number) {
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
