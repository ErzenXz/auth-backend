import { IHttpContext } from '../models';

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
