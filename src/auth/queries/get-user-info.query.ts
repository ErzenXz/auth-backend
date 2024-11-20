export class GetUserInfoQuery {
  /**
   * Represents a query to retrieve user information based on a refresh token.
   *
   * This class encapsulates the necessary data required to fetch user details,
   * specifically the refresh token, which is used for authentication and validation
   * of the user's session. It is designed to be used within a command-query responsibility
   * segregation (CQRS) architecture.
   *
   * @param {string} refreshToken - The refresh token used to authenticate the user and retrieve their information.
   */
  constructor(public readonly refreshToken: string) {}
}
