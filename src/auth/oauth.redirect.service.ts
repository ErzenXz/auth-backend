import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class OAuthRedirectService {
  constructor(private prisma: PrismaService) {}

  async getAllowedOrigins(): Promise<string[]> {
    const allowedOrigins = await this.prisma.allowedOrigins.findMany({
      where: {
        active: true,
      },
    });

    return allowedOrigins.map(
      (origin) =>
        `*.${origin.origin.replace('https://', '').replace('http://', '')}`,
    );
  }

  async isOriginAllowed(origin: string): Promise<boolean> {
    const allowedOrigins = await this.getAllowedOrigins();
    return allowedOrigins.some((allowedOrigin) =>
      origin.endsWith(allowedOrigin),
    );
  }
}
