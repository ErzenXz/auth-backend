import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class PlaygroundAuthMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (
      req.method === 'GET' &&
      req.originalUrl === '/graphql' &&
      process.env.ENVIRONMENT === 'production'
    ) {
      const authHeader = req.headers.authorization;
      if (authHeader === process.env.PLAYGROUND_AUTH_TOKEN) {
        next();
      } else {
        res.status(401).send('Unauthorized');
      }
    } else {
      next();
    }
  }
}
