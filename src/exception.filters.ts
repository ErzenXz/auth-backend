import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [nodeProfilingIntegration()],
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
});

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const userFriendlyMessage =
      'An unexpected error occurred. Please try again later. :(';

    const isHttpException = exception instanceof HttpException;
    const exceptionMessage = isHttpException
      ? (exception.getResponse() as any).message || userFriendlyMessage
      : userFriendlyMessage;

    Sentry.captureException(exception);

    if (exceptionMessage !== 'Unauthorized') {
      this.logger.error(
        `Exception occurred at ${request.url}: ${JSON.stringify({
          message: exceptionMessage,
          stack: (exception as Error).stack || exception.toString(),
        })}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: userFriendlyMessage,
    });
  }
}
