import * as winston from 'winston';
import * as SeqTransport from '@datalust/winston-seq';

// Define the interface for Winston log info
interface WinstonLogInfo extends winston.Logform.TransformableInfo {
  timestamp: string | number;
  level: string;
  message: string;
}

/**
 * Configuration for Winston logging with Seq transport and console output.
 *
 * This configuration sets up Winston to log messages to a Seq server for
 * centralized logging and also outputs logs to the console. It includes
 * error handling for the Seq transport and custom formatting for log messages.
 */
export const winstonConfig = {
  transports: [
    /**
     * Transport for sending logs to a Seq server.
     *
     * This transport uses the SeqTransport to send log messages to a specified
     * Seq server URL, utilizing an API key for authentication. It logs messages
     * at the 'info' level and handles errors that occur during the logging process.
     */
    new SeqTransport.SeqTransport({
      serverUrl: process.env.SEQ_SERVER_URL,
      apiKey: process.env.SEQ_API_KEY,
      level: 'info',
      onError: (e) => {
        console.info('Error sending logs to Seq:', e);
      },
    }),
    /**
     * Transport for logging messages to the console.
     *
     * This transport outputs log messages to the console with a custom format
     * that includes a timestamp, log level, and message. The format is designed
     * to be human-readable, utilizing colorization and pretty printing for clarity.
     */
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.prettyPrint(),
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf((info: WinstonLogInfo) => {
          const readableTimestamp = new Date(info.timestamp).toISOString();
          return `${readableTimestamp} ${info.level}: ${info.message}`;
        }),
      ),
    }),
  ],
};
