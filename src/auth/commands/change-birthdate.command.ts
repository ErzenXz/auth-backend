export class ChangeBirthdateCommand {
  constructor(
    public readonly userId: number,
    public readonly newBirthdate: string,
  ) {}
}
