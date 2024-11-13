import { Controller, Get } from '@nestjs/common';
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

  @Get('send-email')
  async sendEmail(): Promise<any> {
    await this.mailerService.sendMail({
      from: 'noreply@auth.erzen.xyz',
      to: 'erzenkrasniqi@matrics.io',
      subject: 'Test Email',
      text: 'This is a test email',
      html: '<p>This is a test email</p>',
    });

    return {
      message: 'Email sent successfully',
    };
  }
}
