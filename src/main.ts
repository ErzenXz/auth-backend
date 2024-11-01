import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common/pipes/validation.pipe';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import * as fs from 'fs';
import { VersioningType } from '@nestjs/common';
import helmet from 'helmet';
import { Logger } from 'winston';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

async function bootstrap() {
  // Use HTTPS

  const httpsOptions = {
    key: fs.readFileSync('./src/cert/key.pem'),
    cert: fs.readFileSync('./src/cert/cert.pem'),
  };

  const app = await NestFactory.create(AppModule, { httpsOptions });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('ErzenPhotos API')
    .setDescription('The official ErzenPhotos API documentation')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addServer('https://localhost:3000', 'Local server')
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
  SwaggerModule.setup('api', app, document);

  app.use(cookieParser());

  // Disable CORS restrictions
  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  await app.listen(3000);
}
bootstrap();
