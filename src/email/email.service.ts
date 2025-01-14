import { Injectable } from '@nestjs/common';
import { Email } from './interfaces/request.interface';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Service for managing email communications within the application.
 *
 * This class provides methods to send various types of emails, including welcome emails,
 * password reset requests, and general email notifications. It utilizes the MailerService
 * to handle the actual sending of emails and listens for specific events to trigger email
 * notifications automatically.
 */
@Injectable()
export class EmailService {
  constructor(
    @InjectQueue('email') private readonly emailQueue: Queue,
    private readonly prismaService: PrismaService,
  ) {}

  /**
   * Sends a welcome email to a newly registered user.
   *
   * @param {any} data - The data containing user information for the welcome email.
   * @param {string} data.name - The name of the user.
   * @param {string} data.email - The email address of the user.
   * @returns {Promise<void>} A promise that resolves when the email has been sent.
   */
  @OnEvent('auth.register')
  async welcomeEmail(data: any) {
    const { name, email } = data;

    const subject = `Welcome to XENBit: ${name}`;

    await this.emailQueue.add('sendEmail', {
      to: email,
      subject,
      template: './auth/welcome.hbs',
      context: { name, email },
    });
  }

  /**
   * Sends a password reset request email to the user.
   *
   * @param {any} data - The data containing user information for the password reset email.
   * @param {string} data.name - The name of the user.
   * @param {string} data.email - The email address of the user.
   * @param {string} data.token - The token for password reset verification.
   * @returns {Promise<void>} A promise that resolves when the email has been sent.
   */
  @OnEvent('auth.forgot')
  async forgotPassword(data: any) {
    const { name, email, token } = data;

    const subject = `Forgot Password Request`;

    const url = `https://apis.erzen.tk/v1/auth/reset-password/verify/${token}`;

    await this.emailQueue.add('sendEmail', {
      to: email,
      subject,
      template: './auth/forgot.hbs',
      context: { name, email, url },
    });
  }

  /**
   * Sends a password reset confirmation email to the user.
   *
   * @param {any} data - The data containing user information for the password reset confirmation email.
   * @param {string} data.name - The name of the user.
   * @param {string} data.email - The email address of the user.
   * @param {string} data.password - The new password for the user.
   * @returns {Promise<void>} A promise that resolves when the email has been sent.
   */
  @OnEvent('auth.forgot.reset')
  async sendPasswordResetEmail(data: any) {
    const { name, email, password } = data;

    const subject = `Forgot Password Request`;

    await this.emailQueue.add('sendEmail', {
      to: email,
      subject,
      template: './auth/reset-password-email.hbs',
      context: { name, email, password },
    });

    await this.prismaService.userEvents.create({
      data: {
        eventType: 'auth.forgot.reset',
        userId: email,
        data: JSON.stringify({
          name,
          email,
        }),
      },
    });
  }

  /**
   * Sends a generic email with specified details.
   *
   * @param {Email} data - The email data containing recipient and subject information.
   * @param {string} data2 - Additional context data to include in the email.
   * @returns {Promise<void>} A promise that resolves when the email has been sent.
   */
  async send(data: Email, data2: string) {
    const { to, subject } = data;

    await this.emailQueue.add('sendEmail', {
      to,
      subject,
      template: './auth/welcome.hbs',
      context: {
        data2,
      },
    });
  }

  @OnEvent('auth.new-ip-login')
  async handleNewIpLoginEvent(data: any) {
    const { name, email, ip, userAgent, time } = data;

    const ipLocation = await this.prismaService.ipLocation.findFirst({
      where: { ip },
    });

    const loggedInLocation = `${ipLocation.city}, ${ipLocation.region}, ${ipLocation.country}`;

    await this.emailQueue.add('sendEmail', {
      to: email,
      subject: 'New login from a new IP address',
      template: './auth/new-login-location.hbs',
      context: {
        name,
        email,
        ip,
        userAgent,
        location: loggedInLocation,
        time,
      },
    });

    await this.prismaService.userEvents.create({
      data: {
        eventType: 'auth.new-ip-login',
        userId: email,
        data: JSON.stringify({
          ip,
          userAgent,
          location: loggedInLocation,
          time,
        }),
      },
    });
  }

  @OnEvent('auth.register')
  async handleNewUserEvent(data: any) {
    const { name, email } = data;

    await this.prismaService.userEvents.create({
      data: {
        eventType: 'auth.register',
        userId: email,
        data: JSON.stringify({
          name,
          email,
        }),
      },
    });
  }

  @OnEvent('user.birthdate')
  async handleUserBirthdateChangeEvent(data: any) {
    const { id, to, from } = data;

    await this.prismaService.userEvents.create({
      data: {
        eventType: 'user.birthdate',
        userId: id,
        data: JSON.stringify({
          to,
          from,
        }),
      },
    });
  }

  @OnEvent('user.name')
  async handleUserNameChangeEvent(data: any) {
    const { id, to, from } = data;

    await this.prismaService.userEvents.create({
      data: {
        eventType: 'user.name',
        userId: id,
        data: JSON.stringify({
          to,
          from,
        }),
      },
    });
  }

  @OnEvent('user.photo')
  async handleUserProfilePictureChangeEvent(data: any) {
    const { id, to, from } = data;

    await this.prismaService.userEvents.create({
      data: {
        eventType: 'user.photo',
        userId: id,
        data: JSON.stringify({
          to,
          from,
        }),
      },
    });
  }
}
