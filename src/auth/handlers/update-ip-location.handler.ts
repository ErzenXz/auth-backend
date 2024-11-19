import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from 'src/prisma/prisma.service';
import { ChangeIPLocationCommand } from '../commands/update-ip-location.command';
import axios from 'axios';

const API_KEYS = process.env.API_KEYS.split(',');
let apiKeyIndex = 0;

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
    const { headers } = command.context.req;
    const ip = this.getHeaderValue(headers, 'cf-connecting-ip');
    const countryCode = this.getHeaderValue(headers, 'cf-ipcountry');

    // Select API key using round-robin
    const apiKey = API_KEYS[apiKeyIndex];
    apiKeyIndex = (apiKeyIndex + 1) % API_KEYS.length;

    try {
      const geoResponse = await axios.get(`https://ipinfo.io/${ip}/json`, {
        params: {
          token: apiKey,
        },
      });

      const { country, region, city, loc, timezone, org } = geoResponse.data;

      const [latitude, longitude] = loc ? loc.split(',').map(Number) : [0, 0];
      const offset = new Date().getTimezoneOffset();

      await this.prisma.ipLocation.upsert({
        where: { ip },
        update: {
          country,
          countryCode,
          region,
          city,
          latitude: latitude || 0,
          longitude: longitude || 0,
          timezone,
          offset,
          isp: org || '',
          asn: '',
        },
        create: {
          ip,
          country,
          countryCode,
          region,
          city,
          latitude: latitude || 0,
          longitude: longitude || 0,
          timezone,
          offset,
          isp: org || '',
          asn: '',
        },
      });

      return { message: 'IP location saved successfully' };
    } catch (error) {
      return { message: 'Failed to fetch IP information' };
    }
  }
}
