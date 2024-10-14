export class ChangeFullNameCommand {
  constructor(
    public readonly userId: number,
    public readonly newName: string,
  ) {}
}
