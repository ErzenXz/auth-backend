/**
 * Command for user logout operations.
 *
 * This class encapsulates the necessary information required for a user to log out,
 * specifically the refresh token that is used to invalidate the user's session.
 * It ensures that the required data for the logout operation is provided at the time of instantiation.
 *
 * @param {string} refreshToken - The refresh token associated with the user's session,
 * which will be used to revoke access during the logout process.
 */
export class UserLogoutCommand {
  constructor(public readonly refreshToken: string) {}
}
