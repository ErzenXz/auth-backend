import * as winston from 'winston';
import * as SeqTransport from '@datalust/winston-seq';

export const winstonConfig = {
  transports: [
    new SeqTransport.SeqTransport({
      serverUrl: process.env.SEQ_SERVER_URL,
      apiKey: process.env.SEQ_API_KEY,
      level: 'info',
      onError: (e) => {
        console.error('Error sending logs to Seq:', e);
      },
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.prettyPrint(),
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf((info) => {
          const readableTimestamp = new Date(info.timestamp).toUTCString();
          return `${readableTimestamp} ${info.level}: ${info.message}`;
        }),
      ),
    }),
  ],
};
