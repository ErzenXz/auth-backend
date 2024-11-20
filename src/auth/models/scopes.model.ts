export enum AvailableScopes {
  PROFILE = 'Access to basic profile information',
  EMAIL = 'Access to email address',
  PHOTOS = 'Access to photo albums',
  VIDEOS = 'Access to video content',
  OFFLINE_ACCESS = 'Maintain persistent access',
}

export const scopes: Record<string, string> = {
  [AvailableScopes.PROFILE]: 'Access to basic profile information',
  [AvailableScopes.EMAIL]: 'Access to email address',
  [AvailableScopes.PHOTOS]: 'Access to photo albums',
  [AvailableScopes.VIDEOS]: 'Access to video content',
  [AvailableScopes.OFFLINE_ACCESS]: 'Maintain persistent access',
};
