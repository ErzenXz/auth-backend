import { Controller, Get, Header } from '@nestjs/common';
import { AppService } from './app.service';
import { ApiTags } from '@nestjs/swagger';
import * as os from 'os';
import { Auth } from './auth/decorators';
import { Role } from './auth/enums';
import { MailerService } from '@nestjs-modules/mailer';

@ApiTags('Info')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private mailerService: MailerService,
  ) {}

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
  @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  getSystemInfo(): any {
    return {
      platform: os.platform(),
      cpus: os.cpus(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      uptime: os.uptime(),
      release: os.release(),
      loadAverage: os.loadavg(),
    };
  }

  @Get('infrastructure-info')
  // @Auth(Role.ADMIN, Role.SUPER_ADMIN)
  async getInfrastructureInfo(): Promise<any> {
    return this.appService.getInfrastructureInfo();
  }

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
