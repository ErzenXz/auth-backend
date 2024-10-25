export const DEFAULT_PRIVACY_SETTINGS = {
  profile: {
    visibility: 'PUBLIC',
    activeStatus: true,
  },
  communication: {
    messaging: {
      allowMessages: true,
      allowMessagesFrom: 'FRIENDS',
      messagePreview: true,
      readReceipts: true,
    },
    notifications: {
      securityAlerts: true,
      newsAlerts: true,
    },
  },
  security: {
    loginAlerts: true,
  },
  data: {
    anonyomousUsage: true,
    cookies: {
      necessary: true,
      preferences: true,
      statistics: false,
      marketing: false,
    },
  },
  advertising: {
    personalizedAds: false,
    thirdPartyAds: false,
    emailMarketing: false,
    interests: [],
  },
};
