import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { IHttpContext } from './models';
import { NameDto } from './dtos/user/name.dto';
import { BirthdateDto } from './dtos/user/birthdate.dto';
import { PhotoDto } from './dtos/user/photo.dto';
import { ChangeFullNameCommand } from './commands/change-full-name.command';
import { ChangeBirthdateCommand } from './commands/change-birthdate.command';
import { ChangeProfilePictureCommand } from './commands/change-profile-picture.command';

@Injectable()
export class UserService {
  constructor(private readonly commandBus: CommandBus) {}

  async changeFullName(context: IHttpContext, changeDto: NameDto) {
    const { user } = context;
    const { name } = changeDto;

    return this.commandBus.execute(new ChangeFullNameCommand(user.id, name));
  }

  async changeBirthDate(context: IHttpContext, changeDto: BirthdateDto) {
    const { user } = context;
    const { birthdate } = changeDto;

    return this.commandBus.execute(
      new ChangeBirthdateCommand(user.id, birthdate),
    );
  }

  async changeProfilePicture(context: IHttpContext, changeDto: PhotoDto) {
    const { user } = context;
    const { photo } = changeDto;

    return this.commandBus.execute(
      new ChangeProfilePictureCommand(user.id, photo),
    );
  }
}
