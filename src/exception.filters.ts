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

/**
 * Global exception filter for handling all exceptions in the application.
 *
 * This filter catches exceptions thrown in the application, logs them,
 * and sends a structured JSON response to the client. It integrates with
 * Sentry for error tracking and profiling, allowing for better monitoring
 * of application errors.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /**
   * Catches and processes exceptions thrown in the application.
   *
   * @param exception - The exception that was thrown.
   * @param host - The context of the request and response.
   */
  catch(exception: unknown, host: ArgumentsHost): any {
    const contextType = host.getType();

    // If not an HTTP context (like GraphQL), log and rethrow the exception.
    if (contextType !== 'http') {
      this.logger.error(
        `Non-HTTP error: ${exception}`,
        (exception as Error).stack,
      );
      Sentry.captureException(exception);
      throw exception;
    }

    let response: Response | undefined;
    let request: Request | { url?: string } = {};
    const ctx = host.switchToHttp();
    response = ctx.getResponse<Response>();
    request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const defaultMessage =
      'An unexpected error occurred. Please try again later.';
    let errorMessage = defaultMessage;

    if (isHttpException) {
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        errorMessage = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        'message' in exceptionResponse
      ) {
        errorMessage = (exceptionResponse as any).message;
      }
    }

    const reqMethod = (request as Request)?.method ?? 'N/A';
    const reqUrl = request?.url || 'N/A';

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Error ${status} at ${reqMethod} ${reqUrl}: ${errorMessage} ${JSON.stringify(exception)}`,
        (exception as Error).stack,
      );
      Sentry.captureException(exception);
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: reqUrl,
      message: errorMessage,
    });
  }
}
