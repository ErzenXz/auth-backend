export interface ExternalUser {
  externalId?: string;
  externalProvider?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  picture?: string;
  accessToken?: string;
  refreshToken?: string;
}
