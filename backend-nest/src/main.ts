import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import {
  createCorsOptions,
  SecurityConfiguration,
} from './config/security.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const security = app
    .get(ConfigService)
    .getOrThrow<SecurityConfiguration>('security');

  app.use(helmet());
  app.useBodyParser('json', { limit: '100kb' });
  app.enableCors(createCorsOptions(security));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );
  await app.listen(security.port, '0.0.0.0');
}

void bootstrap();
