import { Request, Response } from 'express';

export interface HttpContext {
  req: Request;
  res: Response;
  user?: any;
  ip: string;
  clientIp: {
    raw: string;
    cloudflare: string | null;
    forwarded: string[];
    real: string;
  };
  pagination?: {
    from: number;
    to: number;
  };
}
