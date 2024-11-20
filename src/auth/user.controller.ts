import { Controller, Get, Patch, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

import { Auth } from './decorators/auth.decorator';
import { HttpContext } from './decorators/headers.decorator';
import type { HttpContext as IHttpContext } from './models/http.model';

import { ApiTags } from '@nestjs/swagger';
import { ChangeNameDto, ChangeBirthdateDto, ChangePhotoDto } from './dtos';
import { UserService } from './user.service';
import { RevokeAccessTokenDto } from './dtos/user/revoke.dto';

/**
 * Controller for managing user-related operations.
 *
 * This controller provides endpoints for user actions such as managing active sessions,
 * changing user details (name, birthdate, profile picture), revoking access tokens,
 * and retrieving user events. It utilizes the `AuthService` and `UserService`
 * to perform the necessary operations.
 */
@ApiTags('User')
@Controller({
  path: 'user',
  version: '1',
})
export class UserController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  /**
   * Retrieves the active sessions for the authenticated user.
   *
   * @param req - The HTTP context containing user information.
   * @returns An array of active sessions for the user.
   */
  @Get('active-sessions')
  @Auth()
  async activeSessions(@HttpContext() req: IHttpContext) {
    return this.authService.getAliveSessions(req);
  }

  /**
   * Retrieves the events associated with the authenticated user.
   *
   * @param req - The HTTP context containing user information.
   * @returns An array of user events.
   */
  @Get('events')
  @Auth()
  async events(@HttpContext() req: IHttpContext) {
    return this.authService.getUserEvents(req);
  }

  /**
   * Changes the full name of the authenticated user.
   *
   * @param context - The HTTP context containing user information.
   * @param changeDto - The data transfer object containing the new name.
   * @returns A message indicating the success of the operation.
   */
  @Patch('change-fullName')
  @Auth()
  async changeFullName(
    @HttpContext() context: IHttpContext,
    @Body() changeDto: ChangeNameDto,
  ) {
    await this.userService.changeFullName(context, changeDto);

    return {
      message: 'Name changed successfully',
    };
  }

  /**
   * Changes the birthdate of the authenticated user.
   *
   * @param context - The HTTP context containing user information.
   * @param changeDto - The data transfer object containing the new birthdate.
   * @returns A message indicating the success of the operation.
   */
  @Patch('change-birthdate')
  @Auth()
  async changeBirthDate(
    @HttpContext() context: IHttpContext,
    @Body() changeDto: ChangeBirthdateDto,
  ) {
    await this.userService.changeBirthDate(context, changeDto);

    return {
      message: 'Birthdate changed successfully',
    };
  }

  /**
   * Changes the profile picture of the authenticated user.
   *
   * @param context - The HTTP context containing user information.
   * @param changeDto - The data transfer object containing the new profile picture.
   * @returns A message indicating the success of the operation.
   */
  @Patch('change-profilePicture')
  @Auth()
  async changeProfilePicture(
    @HttpContext() context: IHttpContext,
    @Body() changeDto: ChangePhotoDto,
  ) {
    await this.userService.changeProfilePicture(context, changeDto);

    return {
      message: 'Profile picture changed successfully',
    };
  }

  /**
   * Revokes an access token for the authenticated user.
   *
   * @param context - The HTTP context containing user information.
   * @param revokeDto - The data transfer object containing the token to revoke.
   * @returns The result of the token revocation process.
   */
  @Patch('revoke-token')
  @Auth()
  async revokeToken(
    @HttpContext() context: IHttpContext,
    @Body('token') revokeDto: RevokeAccessTokenDto,
  ) {
    return await this.authService.revokeToken(context, revokeDto.token);
  }

  /**
   * Changes the IP address associated with the authenticated user.
   *
   * @param context - The HTTP context containing user information.
   * @returns The result of the IP change process.
   */
  @Get('change-ip')
  async changeIP(@HttpContext() context: IHttpContext) {
    return this.userService.changeIP(context);
  }
}
