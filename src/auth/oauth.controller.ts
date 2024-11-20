import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  BadRequestException,
  Put,
} from '@nestjs/common';
import { OAuthProviderService } from './app.oauth.service';
import { Request } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Auth, HttpContext } from './decorators';
import { IHttpContext } from './models';

/**
 * Controller for managing OAuth provider operations.
 *
 * This controller provides endpoints for registering applications, managing user consent,
 * handling authorization requests, and managing tokens. It utilizes the `OAuthProviderService`
 * to perform the underlying logic for OAuth operations.
 */
@ApiTags('OAuth Provider')
@Controller('oauth')
export class OAuthProviderController {
  constructor(private readonly oAuthProviderService: OAuthProviderService) {}

  /**
   * Registers a new OAuth client application.
   *
   * @param context - The HTTP context containing user information.
   * @param application - The application data to register.
   * @returns The result of the registration process.
   */
  @Post('applications/register')
  @Auth()
  @ApiOperation({ summary: 'Register a new OAuth client application' })
  async registerApplication(
    @HttpContext() context: IHttpContext,
    @Body() application: any,
  ) {
    return this.oAuthProviderService.registerApplication(context, application);
  }

  /**
   * Retrieves all applications created by the authenticated user.
   *
   * @param context - The HTTP context containing user information.
   * @returns An array of applications associated with the user.
   */
  @Get('applications/dev')
  @Auth()
  @ApiOperation({ summary: 'Returns all the applications created by the user' })
  async getUserApplications(@HttpContext() context: IHttpContext) {
    return this.oAuthProviderService.getUserApplications(context);
  }

  /**
   * Edits an existing OAuth client application.
   *
   * @param context - The HTTP context containing user information.
   * @param applicationId - The ID of the application to edit.
   * @param applicationData - The updated application data.
   * @returns The result of the edit operation.
   */
  @Put('applications/edit')
  @Auth()
  @ApiOperation({ summary: 'Edit an existing OAuth client application' })
  async editUserApplication(
    @HttpContext() context: IHttpContext,
    @Query('application_id') applicationId: string,
    @Body() applicationData: any,
  ) {
    return this.oAuthProviderService.editUserApplication(
      context,
      applicationId,
      applicationData,
    );
  }

  /**
   * Authorizes an OAuth client based on the provided parameters.
   *
   * @param clientId - The client ID of the application.
   * @param redirectUri - The redirect URI for the authorization.
   * @param scope - The requested scopes for the authorization.
   * @param state - The state parameter for maintaining state between request and callback.
   * @param responseType - The type of response expected (e.g., code or token).
   * @param req - The HTTP request object containing user information.
   * @returns The result of the authorization request.
   * @throws BadRequestException if required parameters are missing.
   */
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

  /**
   * Exchanges an authorization code for access and refresh tokens.
   *
   * @param tokenRequest - The request containing the authorization code.
   * @returns The result of the token exchange process.
   */
  @Post('token')
  @ApiOperation({ summary: 'Exchange authorization code for tokens' })
  async token(@Body() tokenRequest: any) {
    return this.oAuthProviderService.handleTokenRequest(tokenRequest);
  }

  /**
   * Retrieves consent screen information for a specific client.
   *
   * @param clientId - The client ID of the application.
   * @param scope - The requested scopes for consent.
   * @param req - The HTTP request object containing user information.
   * @returns The consent screen information.
   * @throws BadRequestException if required parameters are missing.
   */
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

  /**
   * Grants consent for an application to access user data.
   *
   * @param clientId - The client ID of the application.
   * @param scopes - The scopes being granted.
   * @param req - The HTTP request object containing user information.
   * @returns The result of the consent granting process.
   */
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

  /**
   * Revokes access for a specific application.
   *
   * @param clientId - The client ID of the application to revoke access.
   * @param req - The HTTP request object containing user information.
   * @returns The result of the revocation process.
   */
  @Post('revoke')
  @Auth()
  @ApiOperation({ summary: 'Revoke application access' })
  async revokeAccess(
    @Body('client_id') clientId: string,
    @Req() req: Request & { user: any },
  ) {
    return this.oAuthProviderService.revokeAccess(req.user.id, clientId);
  }

  /**
   * Lists all authorized applications for the authenticated user.
   *
   * @param context - The HTTP context containing user information.
   * @returns An array of authorized applications for the user.
   */
  @Get('applications')
  @Auth()
  @ApiOperation({ summary: 'List authorized applications for user' })
  async listApplications(@HttpContext() context: IHttpContext) {
    return this.oAuthProviderService.listUserApplications(context);
  }

  /**
   * Rotates the client secret for a specific application.
   *
   * @param clientId - The client ID of the application.
   * @param currentSecret - The current secret of the application.
   * @param req - The HTTP request object containing user information.
   * @returns The result of the client secret rotation process.
   */
  @Post('applications/rotate-secret')
  @Auth()
  @ApiOperation({ summary: 'Rotate client secret' })
  async rotateClientSecret(
    @Body('client_id') clientId: string,
    @Body('current_secret') currentSecret: string,
  ) {
    return this.oAuthProviderService.rotateClientSecret(
      clientId,
      currentSecret,
    );
  }
}
