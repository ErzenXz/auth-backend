import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { IHttpContext } from './models';
import { ChangeNameDto } from './dtos/user/name.dto';
import { ChangeBirthdateDto } from './dtos/user/birthdate.dto';
import { ChangePhotoDto } from './dtos/user/photo.dto';
import { ChangeFullNameCommand } from './commands/change-full-name.command';
import { ChangeBirthdateCommand } from './commands/change-birthdate.command';
import { ChangeProfilePictureCommand } from './commands/change-profile-picture.command';
import { ChangeIPLocationCommand } from './commands/update-ip-location.command';

/**
 * Service for managing user-related operations.
 *
 * This service provides methods for changing user details such as full name, birthdate,
 * profile picture, and IP location. It utilizes the command bus to execute commands
 * related to these operations, ensuring a clean separation of concerns.
 */
@Injectable()
export class UserService {
  constructor(private readonly commandBus: CommandBus) {}

  /**
   * Changes the full name of the user.
   *
   * @param context - The HTTP context containing user information.
   * @param changeDto - The data transfer object containing the new name.
   * @returns The result of the command execution.
   */
  async changeFullName(context: IHttpContext, changeDto: ChangeNameDto) {
    const { user } = context;
    const { name } = changeDto;

    return this.commandBus.execute(new ChangeFullNameCommand(user.id, name));
  }

  /**
   * Changes the birthdate of the user.
   *
   * @param context - The HTTP context containing user information.
   * @param changeDto - The data transfer object containing the new birthdate.
   * @returns The result of the command execution.
   */
  async changeBirthDate(context: IHttpContext, changeDto: ChangeBirthdateDto) {
    const { user } = context;
    const { birthdate } = changeDto;

    return this.commandBus.execute(
      new ChangeBirthdateCommand(user.id, birthdate),
    );
  }

  /**
   * Changes the profile picture of the user.
   *
   * @param context - The HTTP context containing user information.
   * @param changeDto - The data transfer object containing the new profile picture.
   * @returns The result of the command execution.
   */
  async changeProfilePicture(context: IHttpContext, changeDto: ChangePhotoDto) {
    const { user } = context;
    const { photo } = changeDto;

    return this.commandBus.execute(
      new ChangeProfilePictureCommand(user.id, photo),
    );
  }

  /**
   * Changes the IP location of the user.
   *
   * @param context - The HTTP context containing user information.
   * @returns The result of the command execution.
   */
  async changeIP(context: IHttpContext) {
    return this.commandBus.execute(new ChangeIPLocationCommand(context));
  }
}
