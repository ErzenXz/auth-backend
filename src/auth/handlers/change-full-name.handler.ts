import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ChangeFullNameCommand } from '../commands/change-full-name.command';
import { PrismaService } from 'src/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Command handler for changing a user's full name.
 *
 * This class implements the ICommandHandler interface to handle the execution of
 * the ChangeFullNameCommand. It updates the user's full name in the database
 * using Prisma and emits an event to notify other parts of the application about
 * the change. The handler ensures that the name is updated correctly and
 * provides a success message upon completion.
 *
 * @param {PrismaService} prisma - The Prisma service instance used for database operations.
 * @param {EventEmitter2} eventEmitter - The event emitter instance used to publish events.
 * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a success message.
 */
@CommandHandler(ChangeFullNameCommand)
export class ChangeFullNameHandler
  implements ICommandHandler<ChangeFullNameCommand>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: ChangeFullNameCommand) {
    const { userId, newName } = command;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { fullName: newName },
    });

    this.eventEmitter.emit('user.name', {
      id: userId,
      to: newName,
      from: user.fullName,
    });

    return { message: 'Name changed successfully' };
  }
}
