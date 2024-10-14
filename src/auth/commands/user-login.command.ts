import { IHttpContext } from '../models';

export class UserLoginCommand {
  constructor(
    public readonly email: string,
    public readonly password: string,
    public readonly context: IHttpContext,
  ) {}
}
