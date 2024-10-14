import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ChangeProfilePictureCommand } from '../commands/change-profile-picture.command';
import { PrismaService } from 'src/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@CommandHandler(ChangeProfilePictureCommand)
export class ChangeProfilePictureHandler
  implements ICommandHandler<ChangeProfilePictureCommand>
{
  constructor(
    private prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

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
