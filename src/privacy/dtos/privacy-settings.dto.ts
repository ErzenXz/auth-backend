import { IsObject, IsNotEmpty, IsNumber } from 'class-validator';

export class UpdatePrivacySettingsDto {
  @IsNotEmpty()
  @IsObject()
  settings: {
    profile?: {
      visibility?: string;
      activeStatus?: boolean;
    };

    communication?: {
      messaging?: {
        allowMessages?: boolean;
        allowMessagesFrom?: string;
        messagePreview?: boolean;
        readReceipts?: boolean;
      };
      notifications?: {
        securityAlerts?: boolean;
        newsAlerts?: boolean;
      };
    };
    security?: {
      loginAlerts?: boolean;
    };
    data?: {
      anonyomousUsage?: boolean;
      cookies?: {
        necessary?: boolean;
        preferences?: boolean;
        statistics?: boolean;
        marketing?: boolean;
      };
    };
    advertising?: {
      personalizedAds?: boolean;
      thirdPartyAds?: boolean;
      emailMarketing?: boolean;
      interests?: string[];
    };
  };
}
