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

  /**
   * Handles the process of changing and saving the IP location information.
   *
   * This method retrieves the user's IP address and country code from the request headers,
   * fetches geographical information using an external API, and updates or creates an entry
   * in the database with the retrieved location data. It handles errors gracefully and returns
   * a success message upon completion.
   *
   * @param {ChangeIPLocationCommand} command - The command containing the context with request headers.
   * @param {any} command.context - The context containing the request object with headers.
   * @throws {Error} Throws an error if the IP information cannot be fetched.
   * @returns {Promise<{ message: string }>} A promise that resolves to an object containing a success message.
   */
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

    // First check if the IP location is already saved in the last 7 days

    const ipLocation = await this.prisma.ipLocation.findUnique({
      where: {
        ip,
        updatedAt: {
          gte: new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000),
        },
      },
    });

    if (ipLocation && ipLocation.countryCode) {
      return { message: 'IP location already saved' };
    }

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
