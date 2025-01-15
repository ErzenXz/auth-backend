import * as winston from 'winston';
import * as SeqTransport from '@datalust/winston-seq';
import { v4 as uuidv4 } from 'uuid';
import { hostname } from 'os';

const NODE_ID = `${hostname()}_${uuidv4().slice(0, 8)}`;

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
  defaultMeta: {
    nodeId: NODE_ID,
    hostname: hostname(),
  },
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
      handleExceptions: true,
      handleRejections: true,
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
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      handleExceptions: true,
      handleRejections: true,
      format: winston.format.combine(
        winston.format.errors({ stack: true }),
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.printf((info) => {
          const timestamp =
            typeof info.timestamp === 'string' ||
            typeof info.timestamp === 'number'
              ? new Date(info.timestamp).toISOString()
              : new Date().toISOString();
          const context = info.context
            ? ` ${JSON.stringify(info.context)}`
            : '';
          const version = info.version
            ? ` (version: ${JSON.stringify(info.version)})`
            : '';

          return `${timestamp} ${info.level}:${context}${version}: ${JSON.stringify(info.message)}`;
        }),
      ),
    }),
  ],
  exitOnError: false,
};
