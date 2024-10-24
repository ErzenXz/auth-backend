import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { IHttpContext } from './models';

interface ClientCredentials {
  clientId: string;
  clientSecret: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface OAuthClientApplication {
  clientId: string;
  clientSecret: string;
  name: string;
  redirectUris: string[];
  allowedScopes: string[];
  privacyPolicyUrl: string;
  termsOfServiceUrl: string;
  logoUrl: string;
}

interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  scope: string[];
  state: string;
  responseType: 'code' | 'token';
}

interface TokenRequest {
  grantType: 'authorization_code' | 'refresh_token';
  code?: string;
  refreshToken?: string;
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
}

@Injectable()
export class OAuthProviderService {
  private readonly availableScopes = {
    profile: 'Access to basic profile information',
    email: 'Access to email address',
    photos: 'Access to photo albums',
    videos: 'Access to video content',
    offline_access: 'Maintain persistent access',
  };

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

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

  async getUserApplications(context: IHttpContext) {
    const userApplications = this.prisma.oAuthClient.findMany({
      where: {
        userId: context.user.id,
      },
    });

    return userApplications;
  }

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

    const updatedApplication = await this.prisma.oAuthClient.update({
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

    return updatedApplication;
  }

  async handleAuthorizationRequest(
    authRequest: AuthorizationRequest,
    userId: number,
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
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
    });

    return {
      redirectUri: `${authRequest.redirectUri}?code=${code}&state=${authRequest.state}`,
    };
  }

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

  async getUserConsent(
    userId: number,
    clientId: string,
    requestedScopes: string[],
  ) {
    let client = await this.prisma.oAuthClient.findUnique({
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
        description: this.availableScopes[scope],
      })),
      privacyPolicyUrl: client.privacyPolicyUrl,
      termsOfServiceUrl: client.termsOfServiceUrl,
      logoUrl: client.logoUrl,
    };
  }

  async grantConsent(
    userId: number,
    clientId: string,
    grantedScopes: string[],
  ) {
    // Revoke existing consent
    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    await this.prisma.userConsent.updateMany({
      where: {
        userId,
        clientId: client.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
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

  async revokeAccess(userId: number, clientId: string) {
    let client = await this.prisma.oAuthClient.findUnique({
      where: { clientId },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    // Revoke consent
    await this.prisma.userConsent.updateMany({
      where: {
        userId,
        clientId: client.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
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
        revokedAt: new Date(),
      },
    });
  }

  private async handleAuthorizationCodeGrant(
    tokenRequest: TokenRequest,
    client: any,
  ) {
    const authCode = await this.prisma.authorizationCode.findFirst({
      where: {
        code: tokenRequest.code,
        clientId: client.id,
        used: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!authCode) {
      throw new UnauthorizedException('Invalid authorization code');
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

  private async handleRefreshTokenGrant(
    tokenRequest: TokenRequest,
    client: any,
  ) {
    const refreshTokenRecord = await this.prisma.oAuthToken.findFirst({
      where: {
        token: tokenRequest.refreshToken,
        clientId: client.id,
        type: 'refresh_token',
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!refreshTokenRecord) {
      throw new UnauthorizedException('Invalid refresh token');
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
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    return token;
  }

  private async validateClient(clientId: string, redirectUri: string) {
    const client = await this.prisma.oAuthClient.findUnique({
      where: { clientId, redirectUris: { hasSome: [redirectUri] } },
    });

    if (!client || !client.redirectUris.includes(redirectUri)) {
      throw new UnauthorizedException('Invalid client or redirect URI');
    }

    return client;
  }

  private validateScopes(requestedScopes: string[], allowedScopes: string[]) {
    const invalidScopes = requestedScopes.filter(
      (scope) => !allowedScopes.includes(scope) || !this.availableScopes[scope],
    );

    if (invalidScopes.length > 0) {
      throw new BadRequestException(
        `Invalid scopes: ${invalidScopes.join(', ')}`,
      );
    }
  }

  private async validateClientCredentials(
    clientId: string,
    clientSecret: string,
  ) {
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

  async validateToken(token: string): Promise<any> {
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
        throw new UnauthorizedException('Token has been revoked');
      }

      return decoded;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

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
