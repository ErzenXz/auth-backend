import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrivacyService } from './privacy.service';
import { UpdatePrivacySettingsDto } from './dtos/';
import { Auth, HttpContext } from 'src/auth/decorators';
import { IHttpContext } from 'src/auth/models';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Privacy')
@Controller({
  path: 'privacy-settings',
  version: '1',
})
export class PrivacyController {
  constructor(private readonly privacySettingsService: PrivacyService) {}

  @Post('initialize')
  @Auth()
  async initializePrivacySettings(@HttpContext() context: IHttpContext) {
    return await this.privacySettingsService.initializeDefaultSettings(
      context.user.id,
    );
  }

  @Get('list')
  @Auth()
  async getPrivacySettings(@HttpContext() context: IHttpContext) {
    const settings = await this.privacySettingsService.getPrivacySettings(
      context.user.id,
    );
    if (!settings) {
      throw new HttpException(
        'Privacy settings not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return settings;
  }

  @Post('create')
  @Auth()
  async createPrivacySettings(
    @HttpContext() context: IHttpContext,
    @Body() updatePrivacySettingsDto: UpdatePrivacySettingsDto,
  ) {
    return await this.privacySettingsService.createPrivacySettings(
      context.user.id,
      updatePrivacySettingsDto.settings,
    );
  }

  @Put('update')
  @Auth()
  async updatePrivacySettings(
    @HttpContext() context: IHttpContext,
    @Body() updatePrivacySettingsDto: UpdatePrivacySettingsDto,
  ) {
    return await this.privacySettingsService.updatePrivacySettings(
      context.user.id,
      updatePrivacySettingsDto.settings,
    );
  }

  @Delete('delete')
  @Auth()
  async deletePrivacySettings(@HttpContext() context: IHttpContext) {
    return await this.privacySettingsService.deletePrivacySettings(
      context.user.id,
    );
  }
}
