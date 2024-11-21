import { FastifyRequest, FastifyReply } from 'fastify';

export interface HttpContext {
  req: FastifyRequest;
  res: FastifyReply;
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
