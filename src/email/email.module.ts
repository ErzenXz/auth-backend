import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { join } from 'path';
@Module({
  imports: [
    MailerModule.forRoot({
      transport: {
        host: 'smtp.resend.com',
        port: Number('465'),
        secure: true,
        auth: {
          user: 'resend',
          pass: 're_K7xUDADU_HaF1qcreJdh23T7bKMACHnS8',
        },
      },
      defaults: {
        from: '"XENSystem" <info@auth.erzen.xyz>',
      },
      template: {
        dir: join(__dirname, 'templates'),
        adapter: new HandlebarsAdapter(),
        options: {
          strict: true,
        },
      },
    }),
  ],
  providers: [EmailService],
})
export class EmailModule {}
