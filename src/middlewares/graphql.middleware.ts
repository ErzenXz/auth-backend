import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class PlaygroundAuthMiddleware implements NestMiddleware {
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
