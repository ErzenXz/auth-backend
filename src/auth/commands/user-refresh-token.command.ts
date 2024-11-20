/**
 * Command for refreshing a user's access token.
 *
 * This class encapsulates the necessary information required to refresh a user's access token,
 * specifically the refresh token that is used to obtain a new access token.
 * It ensures that the required data for the refresh operation is provided at the time of instantiation.
 *
 * @param {string} refreshToken - The refresh token associated with the user's session,
 * which will be validated and used to generate a new access token.
 */
export class UserRefreshTokenCommand {
  constructor(public readonly refreshToken: string) {}
}
