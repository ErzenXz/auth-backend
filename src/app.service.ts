import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import Redis from 'ioredis';
import * as os from 'os';
@Injectable()
export class AppService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  async getInfrastructureInfo(): Promise<any> {
    const events = this.eventEmitter.eventNames();

    return {
      system: {
        platform: os.platform(),
        cpus: os.cpus(),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        uptime: os.uptime(),
        release: os.release(),
        loadAverage: os.loadavg(),
      },
      events: events,
    };
  }

  getHello(): string {
    return 'Hello World!';
  }
}
