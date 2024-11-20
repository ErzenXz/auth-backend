import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrivacyService } from './privacy.service';
import { UpdatePrivacySettingsDto } from './dtos/';
import { Auth, HttpContext } from 'src/auth/decorators';
import { IHttpContext } from 'src/auth/models';
import { ApiTags } from '@nestjs/swagger';

/**
 * Controller for managing user privacy settings in the application.
 *
 * This class provides endpoints for initializing, retrieving, creating, updating,
 * and deleting user privacy settings. It utilizes the PrivacyService to perform
 * the underlying operations and ensures that all actions are authenticated using
 * the @Auth() decorator.
 */
@ApiTags('Privacy')
@Controller({
  path: 'privacy-settings',
  version: '1',
})
export class PrivacyController {
  constructor(private readonly privacySettingsService: PrivacyService) {}

  /**
   * Initializes default privacy settings for the authenticated user.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @returns {Promise<any>} A promise that resolves to the result of the initialization operation.
   */
  @Post('initialize')
  @Auth()
  async initializePrivacySettings(@HttpContext() context: IHttpContext) {
    return await this.privacySettingsService.initializeDefaultSettings(
      context.user.id,
    );
  }

  /**
   * Retrieves the privacy settings for the authenticated user.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @returns {Promise<any>} A promise that resolves to the user's privacy settings.
   * @throws {HttpException} Throws an exception if the privacy settings are not found.
   */
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

  /**
   * Creates new privacy settings for the authenticated user.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {UpdatePrivacySettingsDto} updatePrivacySettingsDto - The data transfer object containing the new privacy settings.
   * @returns {Promise<any>} A promise that resolves to the created privacy settings.
   */
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

  /**
   * Updates existing privacy settings for the authenticated user.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @param {UpdatePrivacySettingsDto} updatePrivacySettingsDto - The data transfer object containing the updated privacy settings.
   * @returns {Promise<any>} A promise that resolves to the updated privacy settings.
   */
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

  /**
   * Deletes the privacy settings for the authenticated user.
   *
   * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
   * @returns {Promise<any>} A promise that resolves to the result of the deletion operation.
   */
  @Delete('delete')
  @Auth()
  async deletePrivacySettings(@HttpContext() context: IHttpContext) {
    return await this.privacySettingsService.deletePrivacySettings(
      context.user.id,
    );
  }
}
