import { IHttpContext } from '../models';

/**
 * Command for changing the IP location based on the provided context.
 *
 * This class encapsulates the context of the HTTP request, which includes information
 * about the user's current session and request metadata. It is used to facilitate
 * operations related to updating the user's IP location.
 *
 * @param {IHttpContext} context - The HTTP context containing request metadata and user information.
 */
export class ChangeIPLocationCommand {
  constructor(public readonly context: IHttpContext) {}
}
