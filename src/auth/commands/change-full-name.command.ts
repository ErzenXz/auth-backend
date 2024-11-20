/**
 * Command for changing a user's full name.
 *
 * This class encapsulates the necessary information required to update a user's full name,
 * including the user's unique identifier and the new name to be set. It ensures that
 * all required data for the update operation is provided at the time of instantiation.
 *
 * @param {number} userId - The unique identifier of the user whose full name is being updated.
 * @param {string} newName - The new full name to be assigned to the user.
 */
export class ChangeFullNameCommand {
  constructor(
    public readonly userId: number,
    public readonly newName: string,
  ) {}
}
