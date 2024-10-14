import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ChangeFullNameCommand } from '../commands/change-full-name.command';
import { PrismaService } from 'src/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@CommandHandler(ChangeFullNameCommand)
export class ChangeFullNameHandler
  implements ICommandHandler<ChangeFullNameCommand>
{
  constructor(
    private prisma: PrismaService,
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
