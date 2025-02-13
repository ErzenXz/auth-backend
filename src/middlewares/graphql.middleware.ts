import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Playground Authentication Middleware.
 * This middleware protects the GraphQL Playground in development mode.
 */
@Injectable()
export class PlaygroundAuthMiddleware implements NestMiddleware {
  /**
   * Middleware execution function.
   * Checks for authentication token in development mode for GraphQL Playground access.
   * @param req - The request object.
   * @param res - The response object.
   * @param next - The next function in the middleware chain.
   */
  use(req: Request, res: Response, next: NextFunction) {
    if (req.method === 'GET' && req.originalUrl.startsWith('/graphql')) {
      if (process.env.ENVIRONMENT === 'development') {
        const authToken =
          typeof req.query.auth === 'string' ? req.query.auth : '';
        if (authToken === process.env.PLAYGROUND_AUTH_TOKEN) {
          next();
        } else {
          res.status(401).send('Unauthorized');
        }
      } else {
        next();
      }
    } else {
      next();
    }
  }
}
