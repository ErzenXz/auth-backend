import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OAuthProviderService } from './app.oauth.service';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Auth, HttpContext } from './decorators';
import { IHttpContext } from './models';

@ApiTags('OAuth Provider')
@Controller('oauth')
export class OAuthProviderController {
  constructor(private readonly oAuthProviderService: OAuthProviderService) {}

  @Post('applications/register')
  @Auth()
  @ApiOperation({ summary: 'Register a new OAuth client application' })
  async registerApplication(@Body() application: any) {
    return this.oAuthProviderService.registerApplication(application);
  }

  @Get('authorize')
  @Auth()
  @ApiOperation({ summary: 'Authorize an OAuth client' })
  async authorize(
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('scope') scope: string,
    @Query('state') state: string,
    @Query('response_type') responseType: string,
    @Req() req: Request & { user: any },
  ) {
    if (!clientId || !redirectUri || !scope || !state || !responseType) {
      throw new BadRequestException('Missing required parameters');
    }

    const authRequest = {
      clientId,
      redirectUri,
      scope: scope.split(' '),
      state,
      responseType: responseType as 'code' | 'token',
    };

    return this.oAuthProviderService.handleAuthorizationRequest(
      authRequest,
      req.user.id,
    );
  }

  @Post('token')
  @ApiOperation({ summary: 'Exchange authorization code for tokens' })
  async token(@Body() tokenRequest: any) {
    return this.oAuthProviderService.handleTokenRequest(tokenRequest);
  }

  @Get('consent')
  @Auth()
  @ApiOperation({ summary: 'Get consent screen information' })
  async getConsentScreen(
    @Query('client_id') clientId: string,
    @Query('scope') scope: string,
    @Req() req: Request & { user: any },
  ) {
    if (!clientId || !scope) {
      throw new BadRequestException('Missing required parameters');
    }

    return this.oAuthProviderService.getUserConsent(
      req.user.id,
      clientId,
      scope.split(' '),
    );
  }

  @Post('consent')
  @Auth()
  @ApiOperation({ summary: 'Grant consent for an application' })
  async grantConsent(
    @Body('client_id') clientId: string,
    @Body('scopes') scopes: string[],
    @Req() req: Request & { user: any },
  ) {
    return this.oAuthProviderService.grantConsent(
      req.user.id,
      clientId,
      scopes,
    );
  }

  @Post('revoke')
  @Auth()
  @ApiOperation({ summary: 'Revoke application access' })
  async revokeAccess(
    @Body('client_id') clientId: string,
    @Req() req: Request & { user: any },
  ) {
    return this.oAuthProviderService.revokeAccess(req.user.id, clientId);
  }

  @Get('applications')
  @Auth()
  @ApiOperation({ summary: 'List authorized applications for user' })
  async listApplications(@HttpContext() context: IHttpContext) {
    return this.oAuthProviderService.listUserApplications(context);
  }

  @Post('applications/rotate-secret')
  @Auth()
  @ApiOperation({ summary: 'Rotate client secret' })
  async rotateClientSecret(
    @Body('client_id') clientId: string,
    @Body('current_secret') currentSecret: string,
    @Req() req: Request & { user: any },
  ) {
    return this.oAuthProviderService.rotateClientSecret(
      clientId,
      currentSecret,
    );
  }
}
