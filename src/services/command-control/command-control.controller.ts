// command-control.controller.ts
import { Controller, Post, Body } from '@nestjs/common';
import { CommandControlService } from './command-control.service';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { ApiTags } from '@nestjs/swagger';
import { Role } from 'src/auth/enums';
import { ExecuteCommandDto } from './dtos/execute-command.dto';
import { NodeStatsDto } from './dtos/node-stats.dto';

@ApiTags('Command Control')
@Controller('command-control')
export class CommandControlController {
  constructor(private readonly commandControlService: CommandControlService) {}

  /**
   * Executes a remote command on a target node.
   * Only accessible by ADMIN and SUPER_ADMIN roles.
   *
   * @param commandDto - The command and target node ID.
   */
  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  @Post('execute')
  async executeCommand(@Body() commandDto: ExecuteCommandDto): Promise<void> {
    const { targetNodeId, command } = commandDto;
    await this.commandControlService.executeRemoteCommand(
      targetNodeId,
      command,
    );
  }

  /**
   * Retrieves the statistics of all nodes.
   * Only accessible by ADMIN and SUPER_ADMIN roles.
   *
   * @returns An array of node statistics.
   */
  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  @Post('nodes')
  async getNodes(): Promise<NodeStatsDto[]> {
    return await this.commandControlService.getNodeStatistics();
  }
}
