import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ChangeProfilePictureCommand } from '../commands/change-profile-picture.command';
import { PrismaService } from 'src/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@CommandHandler(ChangeProfilePictureCommand)
export class ChangeProfilePictureHandler
  implements ICommandHandler<ChangeProfilePictureCommand>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Handles the process of changing a user's profile picture.
   *
   * This method updates the user's profile picture in the database with the new photo URL
   * and emits an event to notify other parts of the application about the change. It returns
   * a success message upon successful update of the profile picture.
   *
   * @param {ChangeProfilePictureCommand} command - The command containing the user ID and the new photo URL.
   * @param {string} command.userId - The ID of the user whose profile picture is to be changed.
   * @param {string} command.newPhoto - The URL of the new profile picture to be set.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a success message.
   */
  async execute(command: ChangeProfilePictureCommand) {
    const { userId, newPhoto } = command;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { profilePicture: newPhoto },
    });

    this.eventEmitter.emit('user.photo', {
      id: userId,
      to: newPhoto,
      from: user.profilePicture,
    });

    return { message: 'Profile picture changed successfully' };
  }
}
