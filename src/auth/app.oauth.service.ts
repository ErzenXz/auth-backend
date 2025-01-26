import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { IHttpContext } from './models';
import {
  OAuthClientApplication,
  AuthorizationRequest,
  TokenRequest,
} from './models/oauth.model';
import { scopes } from './models/scopes.model';
import { response } from 'express';

/**
 * Service for managing OAuth client applications and handling authorization flows.
 *
 * This service provides methods for registering applications, managing user consent,
 * handling authorization and token requests, and revoking access. It integrates with
 * a database through Prisma and utilizes JWT for token generation and validation.
 */
@Injectable()
export class OAuthProviderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Registers a new OAuth client application.
   *
   * @param context - The HTTP context containing user information.
   * @param application - Partial data for the new application.
   * @returns An object containing the generated client ID and client secret.
   */
  async registerApplication(
    context: IHttpContext,
    application: Partial<OAuthClientApplication>,
  ) {
    const clientId = crypto.randomBytes(16).toString('hex');
    const clientSecret = crypto.randomBytes(32).toString('hex');
    const hashedSecret = await bcrypt.hash(clientSecret, 10);

    const newApplication = await this.prisma.oAuthClient.create({
      data: {
        clientId,
        clientSecret: hashedSecret,
        userId: context.user.id,
        name: application.name,
        redirectUris: application.redirectUris,
        allowedScopes: application.allowedScopes,
        privacyPolicyUrl: application.privacyPolicyUrl,
        termsOfServiceUrl: application.termsOfServiceUrl,
        logoUrl: application.logoUrl,
      },
    });

    return {
      clientId: newApplication.clientId,
      clientSecret: clientSecret,
    };
  }

  /**
   * Retrieves all OAuth applications registered by the user.
   *
   * @param context - The HTTP context containing user information.
   * @returns An array of OAuth client applications associated with the user.
   */
  async getUserApplications(context: IHttpContext) {
    return this.prisma.oAuthClient.findMany({
      where: {
        userId: context.user.id,
      },
    });
  }

  /**
   * Edits an existing OAuth client application.
   *
   * @param context - The HTTP context containing user information.
   * @param applicationId - The ID of the application to edit.
   * @param applicationData - Partial data to update the application.
   * @returns The updated OAuth client application.
   * @throws Error if the application is not found or the user lacks permission.
   */
  async editUserApplication(
    context: IHttpContext,
    applicationId: string, // or clientId based on how your system identifies apps
    applicationData: Partial<OAuthClientApplication>,
  ) {
    const existingApplication = await this.prisma.oAuthClient.findUnique({
      where: {
        clientId: applicationId,
        userId: context.user.id,
      },
    });

    if (!existingApplication) {
      throw new Error('Application not found');
    }

    if (existingApplication.userId !== context.user.id) {
      throw new Error('You do not have permission to edit this application');
    }

    return await this.prisma.oAuthClient.update({
      where: {
        clientId: applicationId,
        userId: context.user.id,
      },
      data: {
        name: applicationData.name || existingApplication.name,
        redirectUris:
          applicationData.redirectUris || existingApplication.redirectUris,
        allowedScopes:
          applicationData.allowedScopes || existingApplication.allowedScopes,
        privacyPolicyUrl:
          applicationData.privacyPolicyUrl ||
          existingApplication.privacyPolicyUrl,
        termsOfServiceUrl:
          applicationData.termsOfServiceUrl ||
          existingApplication.termsOfServiceUrl,
        logoUrl: applicationData.logoUrl || existingApplication.logoUrl,
      },
    });
  }

  /**
   * Handles an authorization request from a client.
   *
   * Validates the client and requested scopes, generates an authorization code,
   * and stores the authorization request in the database.
   *
   * @param authRequest - The authorization request containing client ID, redirect URI, and requested scopes.
   * @param userId - The ID of the user making the request.
   * @returns An object containing the redirect URI with the authorization code.
   * @throws UnauthorizedException if the client or redirect URI is invalid.
   * @throws BadRequestException if the requested scopes are invalid.
   */
  async handleAuthorizationRequest(
    authRequest: AuthorizationRequest,
    userId: string,
  ) {
    // Validate client and redirect URI
    const client = await this.validateClient(
      authRequest.clientId,
      authRequest.redirectUri,
    );

    // Validate requested scopes
    this.validateScopes(authRequest.scope, client.allowedScopes);

    // Generate authorization code
    const code = crypto.randomBytes(32).toString('hex');

    // Store authorization request
    await this.prisma.authorizationCode.create({
      data: {
        code,
        clientId: client.id,
        userId,
        scope: authRequest.scope,
        redirectUri: authRequest.redirectUri,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
      },
    });

    return {
      redirectUri: `${authRequest.redirectUri}?code=${code}&state=${authRequest.state}`,
    };
  }

  /**
   * Handles a token request from a client.
   *
   * Validates client credentials and processes the request based on the grant type.
   *
   * @param tokenRequest - The token request containing client ID, secret, and grant type.
   * @returns An object containing access and refresh tokens.
   * @throws BadRequestException if the grant type is invalid.
   */
  async handleTokenRequest(tokenRequest: TokenRequest) {
    const client = await this.validateClientCredentials(
      tokenRequest.clientId,
      tokenRequest.clientSecret,
    );

    if (tokenRequest.grantType === 'authorization_code') {
      return this.handleAuthorizationCodeGrant(tokenRequest, client);
    } else if (tokenRequest.grantType === 'refresh_token') {
      return this.handleRefreshTokenGrant(tokenRequest, client);
    }

    throw new BadRequestException('Invalid grant type');
  }

  /**
   * Retrieves user consent for a specific client application.
   *
   * Checks if the user has previously granted consent and returns the consent details.
   *
   * @param userId - The ID of the user.
   * @param clientId - The ID of the client application.
   * @param requestedScopes - The scopes requested by the client.
   * @returns An object containing application details and requested scopes.
   */
  async getUserConsent(
    userId: string,
    clientId: string,
    requestedScopes: string[],
  ) {
    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
    });

    const existingConsent = await this.prisma.userConsent.findFirst({
      where: {
        userId,
        clientId: client.id,
        revokedAt: null,
      },
    });

    if (existingConsent) {
      const hasAllScopes = requestedScopes.every((scope) =>
        existingConsent.grantedScopes.includes(scope),
      );

      if (hasAllScopes) {
        return existingConsent;
      }
    }

    return {
      applicationName: client.name,
      requestedScopes: requestedScopes.map((scope) => ({
        name: scope,
        description: scopes[scope],
      })),
      privacyPolicyUrl: client.privacyPolicyUrl,
      termsOfServiceUrl: client.termsOfServiceUrl,
      logoUrl: client.logoUrl,
    };
  }

  /**
   * Grants consent to a user for a specific client application.
   *
   * Revokes any existing consent before creating a new consent record.
   *
   * @param userId - The ID of the user granting consent.
   * @param clientId - The ID of the client application.
   * @param grantedScopes - The scopes being granted.
   * @returns The newly created user consent record.
   * @throws NotFoundException if the client application is not found.
   */
  async grantConsent(
    userId: string,
    clientId: string,
    grantedScopes: string[],
  ) {
    if (!clientId || !grantedScopes) {
      return response
        .status(400)
        .json({ message: 'Missing required parameters' });
    }

    // Revoke existing consent
    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
    });

    if (!client) {
      return response.status(404).json({ message: 'Client not found' });
    }

    await this.prisma.userConsent.updateMany({
      where: {
        userId,
        clientId: client.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date().toISOString(),
      },
    });

    // Create new consent record
    return this.prisma.userConsent.create({
      data: {
        userId,
        clientId: client.id,
        grantedScopes,
      },
    });
  }

  /**
   * Revokes access for a user to a specific client application.
   *
   * Revokes both user consent and any active tokens associated with the client.
   *
   * @param userId - The ID of the user.
   * @param clientId - The ID of the client application.
   * @throws NotFoundException if the client application is not found.
   */
  async revokeAccess(userId: string, clientId: string) {
    if (!clientId) {
      return response
        .status(400)
        .json({ message: 'Missing required parameters' });
    }

    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
    });

    if (!client) {
      return response.status(404).json({ message: 'Client not found' });
    }

    // Revoke consent
    await this.prisma.userConsent.updateMany({
      where: {
        userId,
        clientId: client.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date().toISOString(),
      },
    });

    // Revoke all active tokens
    await this.prisma.oAuthToken.updateMany({
      where: {
        userId,
        clientId: client.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Handles the authorization code grant type for token requests.
   *
   * Validates the authorization code and generates access and refresh tokens.
   *
   * @param tokenRequest - The token request containing the authorization code.
   * @param client - The validated client application.
   * @returns An object containing access and refresh tokens.
   * @throws UnauthorizedException if the authorization code is invalid.
   */
  private async handleAuthorizationCodeGrant(
    tokenRequest: TokenRequest,
    client: any,
  ) {
    if (!tokenRequest.code) {
      return response
        .status(400)
        .json({ message: 'Missing required parameters' });
    }

    const authCode = await this.prisma.authorizationCode.findFirst({
      where: {
        code: tokenRequest.code,
        clientId: client.id,
        used: false,
        expiresAt: {
          gt: new Date().toISOString(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!authCode) {
      return response
        .status(401)
        .json({ message: 'Invalid authorization code' });
    }

    // Mark code as used
    await this.prisma.authorizationCode.update({
      where: { id: authCode.id },
      data: { used: true },
    });

    // Generate tokens
    const accessToken = this.generateAccessToken(
      authCode.user,
      client,
      authCode.scope,
    );
    const refreshToken = this.generateRefreshToken(
      authCode.user,
      client,
      authCode.scope,
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: authCode.scope.join(' '),
    };
  }

  /**
   * Handles the refresh token grant type for token requests.
   *
   * Validates the refresh token and generates a new access token.
   *
   * @param tokenRequest - The token request containing the refresh token.
   * @param client - The validated client application.
   * @returns An object containing the new access token.
   * @throws UnauthorizedException if the refresh token is invalid.
   */
  private async handleRefreshTokenGrant(
    tokenRequest: TokenRequest,
    client: any,
  ) {
    if (!tokenRequest.refreshToken) {
      return response
        .status(400)
        .json({ message: 'Missing required parameters' });
    }

    const refreshTokenRecord = await this.prisma.oAuthToken.findFirst({
      where: {
        token: tokenRequest.refreshToken,
        clientId: client.id,
        type: 'refresh_token',
        revokedAt: null,
        expiresAt: {
          gt: new Date().toISOString(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!refreshTokenRecord) {
      return response.status(401).json({ message: 'Invalid refresh token' });
    }

    // Generate new tokens
    const accessToken = this.generateAccessToken(
      refreshTokenRecord.user,
      client,
      refreshTokenRecord.scope,
    );

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      scope: refreshTokenRecord.scope.join(' '),
    };
  }

  /**
   * Generates an access token for a user.
   *
   * @param user - The user for whom the token is generated.
   * @param client - The client application requesting the token.
   * @param scope - The scopes associated with the token.
   * @returns The generated access token.
   */
  private generateAccessToken(user: any, client: any, scope: string[]) {
    return this.jwtService.sign(
      {
        sub: user.id,
        client_id: client.clientId,
        scope,
      },
      {
        expiresIn: '1h',
      },
    );
  }

  /**
   * Generates a refresh token for a user.
   *
   * @param user - The user for whom the token is generated.
   * @param client - The client application requesting the token.
   * @param scope - The scopes associated with the token.
   * @returns The generated refresh token.
   */
  private generateRefreshToken(user: any, client: any, scope: string[]) {
    const token = crypto.randomBytes(32).toString('hex');

    // Store refresh token
    this.prisma.oAuthToken.create({
      data: {
        token,
        userId: user.id,
        clientId: client.id,
        type: 'refresh_token',
        scope,
        expiresAt: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString(), // 30 days
      },
    });

    return token;
  }

  /**
   * Validates a client based on client ID and redirect URI.
   *
   * @param clientId - The ID of the client to validate.
   * @param redirectUri - The redirect URI to validate against the client.
   * @returns The validated client object.
   * @throws UnauthorizedException if the client or redirect URI is invalid.
   */
  private async validateClient(clientId: string, redirectUri: string) {
    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId, redirectUris: { hasSome: [redirectUri] } },
    });

    if (!client?.redirectUris?.includes(redirectUri)) {
      throw new UnauthorizedException('Invalid client or redirect URI');
    }

    return client;
  }

  /**
   * Validates requested scopes against allowed scopes.
   *
   * @param requestedScopes - The scopes requested by the client.
   * @param allowedScopes - The scopes allowed for the client.
   * @throws BadRequestException if any requested scopes are invalid.
   */
  private validateScopes(requestedScopes: string[], allowedScopes: string[]) {
    const invalidScopes = requestedScopes.filter(
      (scope) => !allowedScopes.includes(scope) || !scopes[scope],
    );

    if (invalidScopes.length > 0) {
      return response
        .status(400)
        .json({ message: `Invalid scopes: ${invalidScopes.join(', ')}` });
    }
  }

  /**
   * Validates client credentials (ID and secret).
   *
   * @param clientId - The ID of the client to validate.
   * @param clientSecret - The secret of the client to validate.
   * @returns The validated client object.
   * @throws UnauthorizedException if the client is invalid or credentials do not match.
   */
  private async validateClientCredentials(
    clientId: string,
    clientSecret: string,
  ) {
    if (!clientId || !clientSecret) {
      throw new UnauthorizedException('Missing client credentials');
    }

    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
    });

    if (!client) {
      throw new UnauthorizedException('Invalid client');
    }

    const isVALID = bcrypt.compare(clientSecret, client.clientSecret);

    if (!isVALID) {
      throw new UnauthorizedException('Invalid client credentials');
    }

    return client;
  }

  /**
   * Validates a JWT token and checks if it has been revoked.
   *
   * @param token - The JWT token to validate.
   * @returns The decoded token payload.
   * @throws UnauthorizedException if the token is invalid or has been revoked.
   */
  async validateToken(token: string): Promise<any> {
    if (!token) {
      return response
        .status(400)
        .json({ message: 'Missing required parameters' });
    }

    try {
      const decoded = this.jwtService.verify(token);

      // Check if token has been revoked
      const revokedToken = await this.prisma.oAuthToken.findFirst({
        where: {
          token,
          revokedAt: { not: null },
        },
      });

      if (revokedToken) {
        return response.status(401).json({ message: 'Token has been revoked' });
      }

      return decoded;
    } catch (error) {
      return response.status(401).json({ message: 'Invalid token' });
    }
  }

  /**
   * Lists all applications associated with a user, including consent details.
   *
   * @param context - The HTTP context containing user information.
   * @returns An array of user applications with consent details.
   */
  async listUserApplications(context: IHttpContext) {
    const consents = await this.prisma.userConsent.findMany({
      where: {
        userId: context.user.id,
        revokedAt: null,
      },
      include: {
        client: {
          select: {
            name: true,
            description: true,
            logoUrl: true,
            clientId: true,
          },
        },
      },
    });

    return consents.map((consent) => ({
      applicationName: consent.client.name,
      description: consent.client.description,
      logoUrl: consent.client.logoUrl,
      clientId: consent.client.clientId,
      grantedScopes: consent.grantedScopes,
      grantedAt: consent.createdAt,
    }));
  }

  /**
   * Rotates the client secret for a specific client application.
   *
   * Validates the current secret before generating a new one.
   *
   * @param clientId - The ID of the client application.
   * @param currentSecret - The current secret of the client application.
   * @returns An object containing the client ID and the new client secret.
   * @throws UnauthorizedException if the current secret is invalid.
   */
  async rotateClientSecret(clientId: string, currentSecret: string) {
    // Validate current credentials before allowing rotation
    const client = await this.validateClientCredentials(
      clientId,
      currentSecret,
    );

    const newSecret = crypto.randomBytes(32).toString('hex');
    const hashedSecret = await bcrypt.hash(newSecret, 10);

    await this.prisma.oAuthClient.update({
      where: { id: client.id },
      data: { clientSecret: hashedSecret },
    });

    return {
      clientId,
      clientSecret: newSecret,
    };
  }
}
