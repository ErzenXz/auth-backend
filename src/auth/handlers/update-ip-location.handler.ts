import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from 'src/prisma/prisma.service';
import { ChangeIPLocationCommand } from '../commands/update-ip-location.command';

@CommandHandler(ChangeIPLocationCommand)
export class ChangeIPLocationHandler
  implements ICommandHandler<ChangeIPLocationCommand>
{
  constructor(private readonly prisma: PrismaService) {}

  private getHeaderValue(headers: any, key: string): string {
    const value = headers[key];
    return Array.isArray(value) ? value[0] : value || '';
  }

  async execute(command: ChangeIPLocationCommand) {
    const headers = command.context.req.headers;

    const ip = command.context.ip;
    const country = this.getHeaderValue(headers, 'cf-country');
    const countryCode = this.getHeaderValue(headers, 'cf-country-code');
    const region = this.getHeaderValue(headers, 'cf-region');
    const city = this.getHeaderValue(headers, 'cf-city');
    const latitude =
      parseFloat(this.getHeaderValue(headers, 'cf-latitude')) || 0;
    const longitude =
      parseFloat(this.getHeaderValue(headers, 'cf-longitude')) || 0;
    const timezone = this.getHeaderValue(headers, 'cf-timezone');
    const offset = parseInt(this.getHeaderValue(headers, 'cf-offset'), 10) || 0;
    const isp = this.getHeaderValue(headers, 'cf-isp');
    const asn = this.getHeaderValue(headers, 'cf-asn');

    await this.prisma.ipLocation.upsert({
      where: { ip },
      update: {
        country,
        countryCode,
        region,
        city,
        latitude,
        longitude,
        timezone,
        offset,
        isp,
        asn,
      },
      create: {
        ip,
        country,
        countryCode,
        region,
        city,
        latitude,
        longitude,
        timezone,
        offset,
        isp,
        asn,
      },
    });

    return { message: 'IP location saved successfully' };
  }
}
