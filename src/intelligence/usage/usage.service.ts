import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserService } from 'src/user/user.service';
import { Role } from '../../auth/enums';

@Injectable()
export class UsageService {
  private readonly USAGE_LIMITS = {
    [Role.USER]: 100,
    [Role.PREMIUM]: 1000,
    [Role.MODERATOR]: 5000,
    [Role.ADMIN]: 5000,
    [Role.SUPER_ADMIN]: 5000,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
  ) {}

  /**
   * Get or create a user's usage record
   */
  async getUserUsage(userId: string) {
    // Try to find existing usage record
    let usage = await this.prisma.userSearchUsage.findFirst({
      where: { userId },
    });

    if (!usage) {
      // Create new usage record with limits based on user role
      const user = await this.userService.findById(userId);
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const role = user.role as Role;
      const limit = this.USAGE_LIMITS[role] || this.USAGE_LIMITS[Role.USER];

      // Set reset date to first day of next month
      const resetDate = new Date();
      resetDate.setMonth(resetDate.getMonth() + 1);
      resetDate.setDate(1);
      resetDate.setHours(0, 0, 0, 0);

      usage = await this.prisma.userSearchUsage.create({
        data: {
          userId,
          usedRequests: 0,
          totalRequests: limit,
          resetDate,
        },
      });
    }

    // Check if we need to reset based on reset date
    if (new Date() >= usage.resetDate) {
      // It's a new month, reset the counter
      const user = await this.userService.findById(userId);
      const role = user.role as Role;
      const limit = this.USAGE_LIMITS[role] || this.USAGE_LIMITS[Role.USER];

      // Set new reset date to first day of next month
      const resetDate = new Date();
      resetDate.setMonth(resetDate.getMonth() + 1);
      resetDate.setDate(1);
      resetDate.setHours(0, 0, 0, 0);

      usage = await this.prisma.userSearchUsage.update({
        where: { id: usage.id },
        data: {
          usedRequests: 0,
          totalRequests: limit,
          resetDate,
        },
      });
    }

    return usage;
  }

  /**
   * Check if a user has message usage remaining and increment if available
   */
  async checkAndIncrementUsage(userId: string): Promise<boolean> {
    const usage = await this.getUserUsage(userId);

    if (usage.usedRequests >= usage.totalRequests) {
      return false; // User has reached their limit
    }

    // Increment usage
    await this.prisma.userSearchUsage.update({
      where: { id: usage.id },
      data: { usedRequests: usage.usedRequests + 1 },
    });

    return true;
  }

  /**
   * Add additional messages to a user's allowance
   */
  async addRequests(userId: string, amount: number) {
    const usage = await this.getUserUsage(userId);

    return this.prisma.userSearchUsage.update({
      where: { id: usage.id },
      data: { totalRequests: usage.totalRequests + amount },
    });
  }

  /**
   * Remove messages from a user's allowance (with minimum of 0)
   */
  async removeRequests(userId: string, amount: number) {
    const usage = await this.getUserUsage(userId);

    return this.prisma.userSearchUsage.update({
      where: { id: usage.id },
      data: { totalRequests: Math.max(0, usage.totalRequests - amount) },
    });
  }

  /**
   * Get remaining messages for a user
   */
  async getRemainingRequests(userId: string): Promise<{
    used: number;
    total: number;
    remaining: number;
    resetDate: Date;
  }> {
    const usage = await this.getUserUsage(userId);

    return {
      used: usage.usedRequests,
      total: usage.totalRequests,
      remaining: Math.max(0, usage.totalRequests - usage.usedRequests),
      resetDate: usage.resetDate,
    };
  }

  /**
   * Update usage limits when a user's role changes
   */
  async updateUserLimits(userId: string) {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const usage = await this.getUserUsage(userId);
    const role = user.role as Role;
    const limit = this.USAGE_LIMITS[role] || this.USAGE_LIMITS[Role.USER];

    return this.prisma.userSearchUsage.update({
      where: { id: usage.id },
      data: { totalRequests: limit },
    });
  }
}
