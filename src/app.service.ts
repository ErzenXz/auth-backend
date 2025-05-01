import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as os from 'os';
import { CommandControlService } from './services/command-control/command-control.service';

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
   * @param commandControlService - The service used for managing command and control
   */
  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly commandControlService: CommandControlService,
  ) {}

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
    const networkInterfaces = os.networkInterfaces();

    // Get detailed CPU info and usage metrics
    const cpuInfo = os.cpus();
    const cpuCount = cpuInfo.length;
    const cpuModel = cpuInfo[0]?.model || 'Unknown';
    const cpuSpeed = cpuInfo[0]?.speed || 0;

    // Get detailed memory metrics with formatted values
    const totalMemoryBytes = os.totalmem();
    const freeMemoryBytes = os.freemem();
    const usedMemoryBytes = totalMemoryBytes - freeMemoryBytes;

    // Format memory values in different units
    const formatMemory = (bytes: number) => {
      return {
        bytes,
        kilobytes: Math.round((bytes / 1024) * 100) / 100,
        megabytes: Math.round((bytes / 1024 / 1024) * 100) / 100,
        gigabytes: Math.round((bytes / 1024 / 1024 / 1024) * 100) / 100,
      };
    };

    // Calculate memory usage percentages
    const memoryUsagePercentage = Math.round(
      (usedMemoryBytes / totalMemoryBytes) * 100,
    );

    // Get uptime in various formats
    const uptimeSeconds = os.uptime();
    const formatUptime = (seconds: number) => {
      return {
        seconds,
        minutes: Math.round((seconds / 60) * 100) / 100,
        hours: Math.round((seconds / 60 / 60) * 100) / 100,
        days: Math.round((seconds / 60 / 60 / 24) * 100) / 100,
        formatted: `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${Math.floor(seconds % 60)}s`,
      };
    };

    // Process information
    const processInfo = {
      pid: process.pid,
      ppid: process.ppid,
      title: process.title,
      arch: process.arch,
      platform: process.platform,
      version: process.version,
      versions: process.versions,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      resourceUsage: process.resourceUsage
        ? process.resourceUsage()
        : undefined,
      execPath: process.execPath,
      argv: process.argv,
      env: {
        NODE_ENV: process.env.NODE_ENV,
      },
    };

    return {
      nodes: await this.commandControlService.getAllNodes(),
      hardware: {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        type: os.type(),
        endianness: os.endianness(),
        cpus: {
          count: cpuCount,
          model: cpuModel,
          speed: cpuSpeed,
          details: cpuInfo,
          loadAverage: os.loadavg(),
          loadAverageFormatted: {
            '1m': os.loadavg()[0].toFixed(2),
            '5m': os.loadavg()[1].toFixed(2),
            '15m': os.loadavg()[2].toFixed(2),
          },
        },
        memory: {
          total: formatMemory(totalMemoryBytes),
          free: formatMemory(freeMemoryBytes),
          used: formatMemory(usedMemoryBytes),
          usagePercentage: memoryUsagePercentage,
        },
      },
      os: {
        platform: os.platform(),
        release: os.release(),
        version: os.version(),
        type: os.type(),
        uptime: formatUptime(uptimeSeconds),
      },
      network: {
        interfaces: networkInterfaces,
        interfaceCount: Object.keys(networkInterfaces).length,
        ipv4Addresses: Object.values(networkInterfaces)
          .flat()
          .filter(
            (iface) => iface && !iface.internal && iface.family === 'IPv4',
          )
          .map((iface) => iface.address),
        ipv6Addresses: Object.values(networkInterfaces)
          .flat()
          .filter(
            (iface) => iface && !iface.internal && iface.family === 'IPv6',
          )
          .map((iface) => iface.address),
      },
      time: {
        systemTime: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffset: new Date().getTimezoneOffset(),
        localTime: new Date().toString(),
      },
      user: {
        username: os.userInfo().username,
        homedir: os.userInfo().homedir,
        uid: os.userInfo().uid,
        gid: os.userInfo().gid,
      },
      process: processInfo,
      system: {
        events: events,
        eventCount: events.length,
      },
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
