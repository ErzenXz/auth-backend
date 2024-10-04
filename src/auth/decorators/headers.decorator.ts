import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request, Response } from 'express';

function getClientIp(req: Request) {
  const cloudflareIp = req.headers['cf-connecting-ip'] as string;
  const xForwardedFor = ((req.headers['x-forwarded-for'] as string) || '')
    .split(',')
    .map((ip) => ip.trim());
  const xRealIp = req.headers['x-real-ip'] as string;

  return {
    raw: req.ip || req.socket.remoteAddress || '',
    cloudflare: cloudflareIp || null,
    forwarded: xForwardedFor,
    real:
      cloudflareIp ||
      xRealIp ||
      (xForwardedFor.length ? xForwardedFor[0] : null) ||
      req.ip ||
      req.socket.remoteAddress ||
      'unknown',
  };
}

export const HttpContext = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();

    if (!req) {
      console.error('Request object is missing in ExecutionContext');
      throw new Error('Request object is undefined');
    }

    const clientIp = getClientIp(req);

    return {
      req,
      res,
      user: req.user || null,
      ip: clientIp.real,
      clientIp,
    };
  },
);

export const GetClientIp = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    if (!req) {
      console.error('Request object is missing in ExecutionContext');
      throw new Error('Request object is undefined');
    }
    return getClientIp(req);
  },
);
