import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';

import { ApiTags } from '@nestjs/swagger';
import { HttpContext } from './decorators';
import { DiscordOAuthGuard } from './guards/discord.security.jwt';
import { FacebookOAuthGuard } from './guards/facebook.security.jwt';
import { GitHubOAuthGuard } from './guards/github.security.jwt';
import { GoogleOAuthGuard } from './guards/google.security.jwt';
import { LinkedInOAuthGuard } from './guards/linkedin.security.jwt';
import { IHttpContext } from './models';

/**
 * Controller for handling user authentication via various OAuth providers.
 *
 * This class defines routes for authenticating users through Google, GitHub, LinkedIn, Discord, and Facebook.
 * Each provider has a dedicated authentication route and a redirect route that processes the user information
 * after successful authentication, delegating the login logic to the AuthService.
 *
 * @class
 */
@ApiTags('External OAuth')
@Controller({
  path: 'external/oauth',
  version: '1',
})
export class ExternalOAuthController {
  /**
   * Creates an instance of UserController.
   *
   * @param {AuthService} authService - The service responsible for handling authentication logic.
   */
  constructor(private readonly authService: AuthService) {}

  /**
   * Initiates Google OAuth authentication.
   *
   * @returns {Promise<void>} A promise that resolves when the authentication process is initiated.
   */
  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  async googleAuth() {}

  /**
   * Handles the redirect from Google after authentication.
   *
   * @param {Request} req - The request object containing user information after Google authentication.
   * @param {IHttpContext} context - The HTTP context containing request and response objects.
   * @returns {Promise<void>} A promise that resolves when the user is logged in via OAuth.
   */
  @Get('google/redirect')
  @UseGuards(GoogleOAuthGuard)
  async googleAuthRedirect(@Req() req, @HttpContext() context: IHttpContext) {
    const { user } = req;
    return this.authService.loginWithOAuth(user, context);
  }

  /**
   * Initiates GitHub OAuth authentication.
   *
   * @returns {Promise<void>} A promise that resolves when the authentication process is initiated.
   */
  @Get('github')
  @UseGuards(GitHubOAuthGuard)
  async githubAuth() {}

  /**
   * Handles the redirect from GitHub after authentication.
   *
   * @param {Request} req - The request object containing user information after GitHub authentication.
   * @param {IHttpContext} context - The HTTP context containing request and response objects.
   * @returns {Promise<void>} A promise that resolves when the user is logged in via OAuth.
   */
  @Get('github/redirect')
  @UseGuards(GitHubOAuthGuard)
  async githubAuthRedirect(@Req() req, @HttpContext() context: IHttpContext) {
    const { user } = req;
    return this.authService.loginWithOAuth(user, context);
  }

  /**
   * Initiates LinkedIn OAuth authentication.
   *
   * @returns {Promise<void>} A promise that resolves when the authentication process is initiated.
   */
  @Get('linkedin')
  @UseGuards(LinkedInOAuthGuard)
  async linkedinAuth() {}

  /**
   * Handles the redirect from LinkedIn after authentication.
   *
   * @param {Request} req - The request object containing user information after LinkedIn authentication.
   * @param {IHttpContext} context - The HTTP context containing request and response objects.
   * @returns {Promise<void>} A promise that resolves when the user is logged in via OAuth.
   */
  @Get('linkedin/redirect')
  @UseGuards(LinkedInOAuthGuard)
  async linkedinAuthRedirect(@Req() req, @HttpContext() context: IHttpContext) {
    const { user } = req;
    return this.authService.loginWithOAuth(user, context);
  }

  /**
   * Initiates Discord OAuth authentication.
   *
   * @returns {Promise<void>} A promise that resolves when the authentication process is initiated.
   */
  @Get('discord')
  @UseGuards(DiscordOAuthGuard)
  async discordAuth() {}

  /**
   * Handles the redirect from Discord after authentication.
   *
   * @param {Request} req - The request object containing user information after Discord authentication.
   * @param {IHttpContext} context - The HTTP context containing request and response objects.
   * @returns {Promise<void>} A promise that resolves when the user is logged in via OAuth.
   */
  @Get('discord/redirect')
  @UseGuards(DiscordOAuthGuard)
  async discordAuthRedirect(@Req() req, @HttpContext() context: IHttpContext) {
    const { user } = req;
    return this.authService.loginWithOAuth(user, context);
  }

  /**
   * Initiates Facebook OAuth authentication.
   *
   * @returns {Promise<void>} A promise that resolves when the authentication process is initiated.
   */
  @Get('facebook')
  @UseGuards(FacebookOAuthGuard)
  async facebookAuth() {}

  /**
   * Handles the redirect from Facebook after authentication.
   *
   * @param {Request} req - The request object containing user information after Facebook authentication.
   * @param {IHttpContext} context - The HTTP context containing request and response objects.
   * @returns {Promise<void>} A promise that resolves when the user is logged in via OAuth.
   */
  @Get('facebook/redirect')
  @UseGuards(FacebookOAuthGuard)
  async facebookAuthRedirect(@Req() req, @HttpContext() context: IHttpContext) {
    const { user } = req;
    return this.authService.loginWithOAuth(user, context);
  }
}
