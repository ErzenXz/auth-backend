/**
 * Command for changing a user's profile picture.
 *
 * This class encapsulates the necessary information required to update a user's profile photo,
 * including the user's unique identifier and the URL of the new photo. It ensures that all
 * required data for the update operation is provided at the time of instantiation.
 *
 * @param {number} userId - The unique identifier of the user whose profile photo is being updated.
 * @param {string} newPhoto - The URL of the new photo to be assigned to the user's profile.
 */
export class ChangeProfilePictureCommand {
  constructor(
    public readonly userId: number,
    public readonly newPhoto: string,
  ) {}
}
