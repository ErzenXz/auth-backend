import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UsageService } from './usage.service';
import { Auth, HttpContext } from '../../auth/decorators';
import { IHttpContext } from '../../auth/models';
import { Role } from '../../auth/enums';
import { UserService } from 'src/user/user.service';

@ApiTags('Usage')
@Controller('usage')
export class UsageController {
  constructor(
    private readonly usageService: UsageService,
    private readonly userService: UserService,
  ) {}

  /**
   * Get current user's message usage and limits
   */
  @Get()
  @Auth()
  async getUserUsage(@HttpContext() context: IHttpContext) {
    return await this.usageService.getRemainingRequests(context.user.id);
  }

  /**
   * Admin endpoint to add message allowance to a user
   */
  @Post('admin/add/:userId')
  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  async addUserRequests(
    @Param('userId') userId: string,
    @Body() body: { amount: number },
  ) {
    if (!body.amount || body.amount <= 0) {
      throw new HttpException(
        'Amount must be a positive number',
        HttpStatus.BAD_REQUEST,
      );
    }

    return await this.usageService.addRequests(userId, body.amount);
  }

  /**
   * Admin endpoint to remove message allowance from a user
   */
  @Post('admin/remove/:userId')
  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  async removeUserRequests(
    @Param('userId') userId: string,
    @Body() body: { amount: number },
  ) {
    if (!body.amount || body.amount <= 0) {
      throw new HttpException(
        'Amount must be a positive number',
        HttpStatus.BAD_REQUEST,
      );
    }

    return await this.usageService.removeRequests(userId, body.amount);
  }

  /**
   * Admin endpoint to upgrade a user to PREMIUM
   */
  @Post('admin/upgrade/:userId')
  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  async upgradeUser(@Param('userId') userId: string) {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    // Upgrade user to PREMIUM
    await this.userService.updateRole(userId, Role.PREMIUM);

    // Update usage limits based on new role
    const usage = await this.usageService.updateUserLimits(userId);

    return {
      message: 'User upgraded to PREMIUM successfully',
      userId,
      newRole: Role.PREMIUM,
      newUsageLimit: usage.totalRequests,
    };
  }

  /**
   * Admin endpoint to get a specific user's message usage
   */
  @Get('admin/user/:userId')
  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  async getSpecificUserUsage(@Param('userId') userId: string) {
    return await this.usageService.getRemainingRequests(userId);
  }
}
