export class ChangeProfilePictureCommand {
  constructor(
    public readonly userId: number,
    public readonly newPhoto: string,
  ) {}
}
