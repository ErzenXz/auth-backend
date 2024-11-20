export interface OAuthClientApplication {
  clientId: string;
  clientSecret: string;
  name: string;
  redirectUris: string[];
  allowedScopes: string[];
  privacyPolicyUrl: string;
  termsOfServiceUrl: string;
  logoUrl: string;
}

export interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  scope: string[];
  state: string;
  responseType: 'code' | 'token';
}

export interface TokenRequest {
  grantType: 'authorization_code' | 'refresh_token';
  code?: string;
  refreshToken?: string;
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
}
