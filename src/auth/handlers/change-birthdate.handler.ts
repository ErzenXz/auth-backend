import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ChangeBirthdateCommand } from '../commands/change-birthdate.command';
import { PrismaService } from 'src/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Command handler for changing a user's birthdate.
 *
 * This class implements the ICommandHandler interface to handle the execution of
 * the ChangeBirthdateCommand. It updates the user's birthdate in the database
 * using Prisma and emits an event to notify other parts of the application about
 * the change. The handler ensures that the birthdate is updated correctly and
 * provides a success message upon completion.
 *
 * @param {PrismaService} prisma - The Prisma service instance used for database operations.
 * @param {EventEmitter2} eventEmitter - The event emitter instance used to publish events.
 * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a success message.
 */
@CommandHandler(ChangeBirthdateCommand)
export class ChangeBirthdateHandler
  implements ICommandHandler<ChangeBirthdateCommand>
{
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: ChangeBirthdateCommand) {
    const { userId, newBirthdate } = command;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { birthdate: newBirthdate },
    });

    this.eventEmitter.emit('user.birthdate', {
      id: userId,
      to: newBirthdate,
      from: user.birthdate,
    });

    return { message: 'Birthdate changed successfully' };
  }
}
