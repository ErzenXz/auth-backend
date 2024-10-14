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

  @OnEvent('auth.forgot')
  async forgotPassword(data: any) {
    const { name, email, token } = data;

    const subject = `Forgot Password Request`;

    const url = `https://localhost:3000/v1/auth/reset-password/verify/${token}`;

    await this.mailerService.sendMail({
      to: email,
      subject,
      template: './auth/forgot.hbs',
      context: {
        name,
        email,
        token: url,
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
