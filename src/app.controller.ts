import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiTags } from '@nestjs/swagger';
import * as os from 'os';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { emit } from 'process';

@ApiTags('Info')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth(): string {
    return 'OK';
  }

  @Get('version')
  getVersion(): string {
    return '1.0.0';
  }

  @Get('author')
  getAuthor(): string {
    return 'Erzen Krasniqi';
  }

  @Get('system-info')
  getSystemInfo(): any {
    return {
      platform: os.platform(),
      cpus: os.cpus(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptime: os.uptime(),
    };
  }
}
