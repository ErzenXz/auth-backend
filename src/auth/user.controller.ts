import { Controller, Get, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

import { Auth } from './decorators/auth.decorator';
import { HttpContext } from './decorators/headers.decorator';
import type { HttpContext as IHttpContext } from './models/http.model';

import { ApiTags } from '@nestjs/swagger';
import { Patch, Body } from '@nestjs/common';
import { ChangeNameDto, ChangeBirthdateDto, ChangePhotoDto } from './dtos';
import { UserService } from './user.service';
import { RevokeAccessTokenDto } from './dtos/user/revoke.dto';

@ApiTags('User')
@Controller({
  path: 'user',
  version: '1',
})
export class UserController {
  constructor(
    private authService: AuthService,
    private userService: UserService,
  ) {}

  @Get('active-sessions')
  @Auth()
  async activeSessions(@HttpContext() req: IHttpContext) {
    return this.authService.getAliveSessions(req);
  }

  @Get('events')
  @Auth()
  async events(@HttpContext() req: IHttpContext) {
    return this.authService.getUserEvents(req);
  }

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

  @Patch('revoke-token')
  @Auth()
  async revokeToken(
    @HttpContext() context: IHttpContext,
    @Body('token') revokeDto: RevokeAccessTokenDto,
  ) {
    return await this.authService.revokeToken(context, revokeDto.token);
  }

  @Get('change-ip')
  async changeIP(@HttpContext() context: IHttpContext) {
    return this.userService.changeIP(context);
  }
}
