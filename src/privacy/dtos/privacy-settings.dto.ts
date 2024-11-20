import { IsObject, IsNotEmpty } from 'class-validator';

/**
 * Data Transfer Object (DTO) for updating user privacy settings.
 *
 * This class defines the structure of the data required to update a user's privacy settings,
 * ensuring that the settings object is provided and contains various options for profile visibility,
 * communication preferences, security alerts, data usage, and advertising preferences.
 * It utilizes class-validator decorators for validation.
 */
export class UpdatePrivacySettingsDto {
  /**
   * The settings object containing various privacy preferences.
   *
   * This property must be a non-empty object that includes options for profile visibility,
   * communication preferences, security settings, data usage, and advertising preferences.
   *
   * @type {Object}
   * @validation @IsNotEmpty() - Ensures the settings object is not empty.
   * @validation @IsObject() - Ensures the value is an object.
   */
  @IsNotEmpty()
  @IsObject()
  settings: {
    profile?: {
      visibility?: string; // The visibility setting for the user's profile.
      activeStatus?: boolean; // Indicates if the user's active status is visible.
    };

    communication?: {
      messaging?: {
        allowMessages?: boolean; // Indicates if messaging is allowed.
        allowMessagesFrom?: string; // Specifies who can send messages (e.g., "friends", "everyone").
        messagePreview?: boolean; // Indicates if message previews are allowed.
        readReceipts?: boolean; // Indicates if read receipts are enabled.
      };
      notifications?: {
        securityAlerts?: boolean; // Indicates if security alerts are enabled.
        newsAlerts?: boolean; // Indicates if news alerts are enabled.
      };
    };
    security?: {
      loginAlerts?: boolean; // Indicates if login alerts are enabled.
    };
    data?: {
      anonyomousUsage?: boolean; // Indicates if anonymous usage tracking is allowed.
      cookies?: {
        necessary?: boolean; // Indicates if necessary cookies are accepted.
        preferences?: boolean; // Indicates if preference cookies are accepted.
        statistics?: boolean; // Indicates if statistics cookies are accepted.
        marketing?: boolean; // Indicates if marketing cookies are accepted.
      };
    };
    advertising?: {
      personalizedAds?: boolean; // Indicates if personalized ads are enabled.
      thirdPartyAds?: boolean; // Indicates if third-party ads are enabled.
      emailMarketing?: boolean; // Indicates if email marketing is allowed.
      interests?: string[]; // An array of user interests for targeted advertising.
    };
  };
}
