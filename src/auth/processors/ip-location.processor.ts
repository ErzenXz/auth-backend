import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { CommandBus } from '@nestjs/cqrs';
import { ChangeIPLocationCommand } from '../commands/update-ip-location.command';

/**
 * Processes IP location update jobs by executing the corresponding command.
 *
 * This class extends the WorkerHost and is responsible for handling jobs that involve changing the IP location.
 * It utilizes a command bus to execute the ChangeIPLocationCommand with the provided context from the job data.
 * Errors during processing are logged and re-thrown for further handling.
 *
 * @class
 * @extends WorkerHost
 */
@Processor('ip-location')
export class IPLocationProcessor extends WorkerHost {
  /**
   * Creates an instance of IPLocationProcessor.
   *
   * @param {CommandBus} commandBus - The command bus used to execute commands related to IP location changes.
   */
  constructor(private readonly commandBus: CommandBus) {
    super();
  }

  /**
   * Processes a job to change the IP location.
   *
   * @param {Job<any>} job - The job containing data necessary for processing, including the context for the IP location change.
   * @returns {Promise<void>} A promise that resolves when the job has been processed.
   * @throws {Error} Throws an error if the processing fails.
   */
  async process(job: Job<any>): Promise<void> {
    try {
      const { context } = job.data;

      await this.commandBus.execute(new ChangeIPLocationCommand(context));
    } catch (error) {
      console.error('Error processing IP location update:', error);
      throw error;
    }
  }
}
