export class UserLogoutCommand {
  constructor(public readonly refreshToken: string) {}
}
