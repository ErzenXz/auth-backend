import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Retrieves the client's IP address from the request object.
 *
 * This function extracts various IP address headers from the incoming request,
 * including Cloudflare's connecting IP, the X-Forwarded-For header, and the
 * X-Real-IP header. It returns an object containing the raw IP address,
 * Cloudflare IP, forwarded IPs, and the most reliable real IP address
 * determined from the available headers.
 *
 * @param {Request} req - The HTTP request object from which to extract the IP address.
 * @returns {{ raw: string, cloudflare: string | null, forwarded: string[], real: string }} An object containing:
 * - `raw`: The raw IP address from the request.
 * - `cloudflare`: The Cloudflare connecting IP, if available.
 * - `forwarded`: An array of IP addresses from the X-Forwarded-For header.
 * - `real`: The most reliable real IP address determined from the headers.
 */
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

/**
 * A custom decorator that extracts the HTTP context, including the request, response,
 * user information, and the client's IP address.
 *
 * This decorator can be used in route handlers to easily access the request and response
 * objects along with additional client information. It utilizes the getClientIp function
 * to retrieve the client's IP address and includes it in the returned context.
 *
 * @returns {{ req: Request, res: Response, user: any, ip: string, clientIp: object }} An object containing:
 * - `req`: The HTTP request object.
 * - `res`: The HTTP response object.
 * - `user`: The authenticated user object, if available.
 * - `ip`: The real IP address of the client.
 * - `clientIp`: An object containing various IP address details.
 */
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

/**
 * A custom decorator that retrieves the client's IP address from the request object.
 *
 * This decorator can be used in route handlers to easily access the client's IP address
 * without needing to manually extract it from the request. It utilizes the getClientIp
 * function to return the client's IP information.
 *
 * @returns {string} The client's IP address as determined by the getClientIp function.
 */
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
