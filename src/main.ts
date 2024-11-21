/**
 * Copyright (C) 2024 Erzen Krasniqi
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import 'dotenv/config';
import 'newrelic';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common/pipes/validation.pipe';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as fs from 'fs';
import { VersioningType } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { RedisIoAdapter } from './messaging/adapters/redis-io.adapter';
import { join } from 'path';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import helmet from 'helmet';
import fastifyCookie from '@fastify/cookie';
import { fastifyCompress } from '@fastify/compress';

async function bootstrap() {
  // Use HTTPS

  const httpsOptions = {
    key: fs.readFileSync('./src/cert/key.pem'),
    cert: fs.readFileSync('./src/cert/cert.pem'),
    http2: true,
  };

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ https: httpsOptions }),
  );

  const fastifyAdapter = new FastifyAdapter();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const config = new DocumentBuilder()
    .setTitle('XENAuth API')
    .setDescription('The official XENAuth API documentation')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addSecurityRequirements('access-token')
    .addServer('https://localhost:3000', 'LOCAL server')
    .addServer('https://api.erzen.xyz', 'DEV server')
    .addServer('https://apis.erzen.xyz', 'PRODUCTION server')
    .setContact(
      'Erzen Krasniqi',
      'https://erzen.tk',
      'erzenkrasniqi@matrics.io',
    )
    .setTermsOfService('https://erzen.tk/terms')
    .setLicense('AGPL-3.0', 'https://www.gnu.org/licenses/agpl-3.0.en.html')
    .build();

  app.enableVersioning({
    type: VersioningType.URI,
  });

  app.use(helmet());

  const document = SwaggerModule.createDocument(app, config);
  const publicPath = join(__dirname, '..', 'public');
  if (!fs.existsSync(publicPath)) {
    fs.mkdirSync(publicPath, { recursive: true });
  }
  fs.writeFileSync(
    join(publicPath, 'swagger.json'),
    JSON.stringify(document, null, 2),
  );

  // Serve static files from public directory
  app.useStaticAssets({ root: publicPath });
  SwaggerModule.setup('api', app, document);

  await fastifyAdapter.register(fastifyCookie as any);

  fastifyAdapter.register(require('@fastify/cors'), {
    origin: (requestOrigin, callback) => {
      if (!requestOrigin) {
        return callback(null, true);
      }
      callback(null, true);
    },
    credentials: true,
  });

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  fastifyAdapter.register(fastifyCompress as any, { level: 9 });

  app.useWebSocketAdapter(new RedisIoAdapter(app));

  await app.listen(3000);
}
bootstrap();
