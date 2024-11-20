import { IHttpContext } from '../models';

/**
 * Command for user registration operations.
 *
 * This class encapsulates the necessary information required for a user to register,
 * including personal details such as email, password, name, username, birthdate,
 * language, timezone, and the HTTP context. It ensures that all required data for
 * the registration process is provided at the time of instantiation.
 *
 * @param {string} email - The email address of the user registering for an account.
 * @param {string} password - The password chosen by the user for account security.
 * @param {string} name - The full name of the user being registered.
 * @param {string} username - The desired username for the user's account.
 * @param {Date} birthdate - The birthdate of the user, used for age verification and personalization.
 * @param {string} language - The preferred language of the user for communication.
 * @param {string} timezone - The timezone of the user, used for scheduling and notifications.
 * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
 */
export class UserRegisterCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly name: string,
    public readonly username: string,
    public readonly birthdate: Date,
    public readonly language: string,
    public readonly timezone: string,
    public readonly context: IHttpContext,
  ) {}
}
