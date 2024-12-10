// command-control.module.ts
import { Module, Global } from '@nestjs/common';
import { CommandControlService } from './command-control.service';
import { CommandControlController } from './command-control.controller';

@Global()
@Module({
  providers: [CommandControlService],
  controllers: [CommandControlController],
  exports: [CommandControlService],
})
export class CommandControlModule {}
