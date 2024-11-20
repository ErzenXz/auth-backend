/**
 * Command for changing a user's birthdate.
 *
 * This class encapsulates the necessary information required to update a user's birthdate,
 * including the user's unique identifier and the new birthdate to be set. It ensures that
 * all required data for the update operation is provided at the time of instantiation.
 *
 * @param {number} userId - The unique identifier of the user whose birthdate is being updated.
 * @param {string} newBirthdate - The new birthdate to be assigned to the user, formatted as a string.
 */
export class ChangeBirthdateCommand {
  constructor(
    public readonly userId: number,
    public readonly newBirthdate: string,
  ) {}
}
