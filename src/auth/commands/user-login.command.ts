import { IHttpContext } from '../models';

/**
 * Command for user login operations.
 *
 * This class encapsulates the necessary information required for a user to log in,
 * including the user's email, password, and the HTTP context. It ensures that all
 * required data for the login operation is provided at the time of instantiation.
 *
 * @param {string} email - The email address of the user attempting to log in.
 * @param {string} password - The password associated with the user's account.
 * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
 */
export class UserLoginCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly context: IHttpContext,
  ) {}
}
