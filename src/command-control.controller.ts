// command-control.controller.ts
import { Controller, Post, Param, Get, ParseUUIDPipe } from '@nestjs/common';
import {
  CommandControlService,
  Node,
} from './services/command-control.service';

@Controller('nodes')
export class CommandControlController {
  constructor(private readonly commandControlService: CommandControlService) {}

  @Get()
  getAllNodes() {
    return this.commandControlService.getAllNodes();
  }

  @Post(':nodeId/stop')
  stopNode(@Param('nodeId', new ParseUUIDPipe()) nodeId: string) {
    this.commandControlService.controlNode(nodeId, 'stop');
    return { message: `Stop command sent to node ${nodeId}.` };
  }

  @Post(':nodeId/restart')
  restartNode(@Param('nodeId', new ParseUUIDPipe()) nodeId: string) {
    this.commandControlService.controlNode(nodeId, 'restart');
    return { message: `Restart command sent to node ${nodeId}.` };
  }

  @Post('stop-all')
  stopAll() {
    this.commandControlService.stopAll();
    return { message: 'Stop command sent to all nodes.' };
  }

  @Post('restart-all')
  restartAll() {
    this.commandControlService.restartAll();
    return { message: 'Restart command sent to all nodes.' };
  }
}
