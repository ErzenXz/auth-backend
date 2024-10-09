import { MailerService } from '@nestjs-modules/mailer';
import { Injectable } from '@nestjs/common';
import { Email } from './interfaces/request.interface';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class EmailService {
  constructor(private readonly mailerService: MailerService) {}

  @OnEvent('auth.register')
  async welcomeEmail(data: any) {
    const { name, email } = data;

    const subject = `Welcome to XENBit: ${name}`;

    await this.mailerService.sendMail({
      to: email,
      subject,
      template: './auth/welcome.hbs',
      context: {
        name,
        email,
      },
    });
  }

  async send(data: Email, data2: string) {
    const { to, subject, body } = data;

    await this.mailerService.sendMail({
      to,
      subject,
      template: './welcome',
      context: {
        data2,
      },
    });
  }
}
