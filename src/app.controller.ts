import { Controller, Get, Header } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiTags } from '@nestjs/swagger';
import * as os from 'os';
import { Auth } from './auth/decorators';
import { Role } from './auth/enums';

/**
 * Controller for handling application-related endpoints.
 *
 * This controller provides various endpoints for retrieving application information,
 * including health status, version, author details, system information, and API documentation.
 * It utilizes the `AppService` for some operations and includes authorization checks for
 * certain endpoints.
 */
@ApiTags('Info')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * Returns a greeting message.
   *
   * @returns A string containing the greeting "Hello World!".
   */
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Checks the health status of the application.
   *
   * @returns A string indicating the health status, typically "OK".
   */
  @Get('health')
  getHealth(): string {
    return 'OK';
  }

  /**
   * Retrieves the current version of the application.
   *
   * @returns A string representing the version number of the application.
   */
  @Get('version')
  getVersion(): string {
    return '1.0.0';
  }

  /**
   * Retrieves the author information of the application.
   *
   * @returns A string containing the author's name.
   */
  @Get('author')
  getAuthor(): string {
    return 'Erzen Krasniqi';
  }

  /**
   * Retrieves system information for the application.
   *
   * This endpoint is protected and requires the user to have either ADMIN or SUPER_ADMIN role.
   *
   * @returns An object containing various system metrics such as platform, CPU details,
   * total memory, free memory, uptime, release version, and load averages.
   */
  @Get('system-info')
  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  getSystemInfo(): any {
    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      type: os.type(),
      cpus: {
        count: os.cpus().length,
        model: os.cpus()[0].model,
        speed: os.cpus()[0].speed,
        times: os.cpus()[0].times,
        details: os.cpus(),
      },
      memory: {
        total: {
          bytes: os.totalmem(),
          gigabytes:
            Math.round((os.totalmem() / 1024 / 1024 / 1024) * 100) / 100,
        },
        free: {
          bytes: os.freemem(),
          gigabytes:
            Math.round((os.freemem() / 1024 / 1024 / 1024) * 100) / 100,
        },
        used: {
          bytes: os.totalmem() - os.freemem(),
          gigabytes:
            Math.round(
              ((os.totalmem() - os.freemem()) / 1024 / 1024 / 1024) * 100,
            ) / 100,
        },
        usagePercentage: Math.round(
          ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
        ),
      },
      time: {
        uptime: {
          seconds: os.uptime(),
          minutes: Math.round((os.uptime() / 60) * 100) / 100,
          hours: Math.round((os.uptime() / 60 / 60) * 100) / 100,
          days: Math.round((os.uptime() / 60 / 60 / 24) * 100) / 100,
        },
        systemTime: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffset: new Date().getTimezoneOffset(),
      },
      os: {
        release: os.release(),
        version: os.version(),
        endianness: os.endianness(),
      },
      network: {
        interfaces: os.networkInterfaces(),
      },
      performance: {
        loadAverage: os.loadavg(),
      },
      user: {
        username: os.userInfo().username,
        homedir: os.userInfo().homedir,
        uid: os.userInfo().uid,
        gid: os.userInfo().gid,
      },
    };
  }

  /**
   * Retrieves infrastructure information about the system.
   *
   * This method asynchronously fetches infrastructure details using the AppService.
   *
   * @returns A promise that resolves to an object containing infrastructure information.
   */
  @Get('infrastructure-info')
  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  async getInfrastructureInfo(): Promise<any> {
    return this.appService.getInfrastructureInfo();
  }

  /**
   * Serves the API documentation as an HTML response.
   *
   * This endpoint sets the appropriate headers for content type and security policies
   * and returns an HTML document that includes scripts for rendering the API reference.
   *
   * @returns An HTML string containing the API documentation.
   */
  @Get('docs')
  @Header('Content-Type', 'text/html')
  @Header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' cdn.jsdelivr.net; connect-src 'self' proxy.scalar.com; img-src 'self' data: cdn.jsdelivr.net; style-src 'self' 'unsafe-inline';",
  )
  getScalarDocs() {
    return `<!DOCTYPE html>
    <html>
      <head>
        <title>API Reference</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body>
        <script
          id="api-reference"
          data-url="/swagger.json"
          data-proxy-url="https://proxy.scalar.com">
        </script>
        <script>
      var configuration = {
        theme: 'deepSpace',
      }

      document.getElementById('api-reference').dataset.configuration =
                      JSON.stringify(configuration);
      </script>
        <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
      </body>
    </html>`;
  }
}
