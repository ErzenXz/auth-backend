import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as os from 'os';

/**
 * Service for providing application-related functionalities.
 *
 * This service offers methods to retrieve infrastructure information, such as system
 * details and event names from the event emitter. It also includes a simple greeting
 * method for demonstration purposes.
 */
@Injectable()
export class AppService {
  /**
   * Constructs the AppService with the specified event emitter.
   *
   * @param eventEmitter - The event emitter instance used for managing events
   * within the application.
   */
  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Retrieves infrastructure information about the system.
   *
   * This method gathers various system metrics using the `os` module, including
   * platform details, CPU information, memory statistics, uptime, and load averages.
   * It also retrieves the names of events currently registered with the event emitter.
   *
   * @returns A promise that resolves to an object containing system information
   * and event names.
   */
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

  /**
   * Returns a simple greeting message.
   *
   * @returns A string containing the greeting "Hello World!".
   */
  getHello(): string {
    return 'Hello World!';
  }
}
