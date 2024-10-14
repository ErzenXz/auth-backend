import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ChangeBirthdateCommand } from '../commands/change-birthdate.command';
import { PrismaService } from 'src/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@CommandHandler(ChangeBirthdateCommand)
export class ChangeBirthdateHandler
  implements ICommandHandler<ChangeBirthdateCommand>
{
  constructor(
    private prisma: PrismaService,
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
