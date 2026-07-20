import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { ServerResponse } from 'http';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';

function logLevels(nodeEnv: string) {
  return nodeEnv === 'production'
    ? (['error', 'warn', 'log'] as const)
    : (['error', 'warn', 'log', 'debug', 'verbose'] as const);
}

async function bootstrap() {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: [...logLevels(nodeEnv)],
  });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  setupApp(app);

  // Uploaded avatars are served outside the API prefix, e.g.
  // GET /uploads/avatars/<file>.png
  //
  // Helmet defaults Cross-Origin-Resource-Policy to `same-origin`, which stops
  // the frontend (a different origin) from rendering these images at all — the
  // request succeeds but the browser discards the response. Relax it to
  // `cross-origin` for uploads only, leaving the API's own headers untouched.
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
    setHeaders: (res: ServerResponse) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });

  app.enableCors({
    origin: config.get<string[]>('cors.origins'),
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('PNC Journey Star API')
    .setDescription('Backend API for the PNC Students’ Journey Star System')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const prefix = config.get<string>('appPrefix') ?? 'api/v1';
  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  logger.log(`Application running on http://localhost:${port}/${prefix}`);
  logger.log(`Swagger docs available at http://localhost:${port}/api/docs`);
}

void bootstrap();
