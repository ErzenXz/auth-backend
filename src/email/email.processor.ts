import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MailerService } from '@nestjs-modules/mailer';

/**
 * Class responsible for processing email jobs and sending emails.
 *
 * This class extends the WorkerHost and utilizes the MailerService to send emails based on the job data provided.
 * It extracts the necessary information from the job and invokes the mailer service to perform the email sending operation.
 */
@Processor('email')
export class EmailProcessor extends WorkerHost {
  /**
   * Creates an instance of EmailProcessor.
   *
   * @param mailerService - An instance of MailerService used to send emails.
   */
  constructor(private readonly mailerService: MailerService) {
    super();
  }

  /**
   * Processes the given job and sends an email.
   *
   * @param job - The job containing email details such as recipient, subject, template, and context.
   * @returns A promise that resolves when the email has been sent.
   *
   * @throws Will throw an error if the email sending fails.
   */
  async process(job: Job<any>): Promise<void> {
    const { to, subject, template, context } = job.data;

    await this.mailerService.sendMail({
      to,
      subject,
      template,
      context,
    });
  }
}
