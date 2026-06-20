import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { loggerMiddleware } from './common/middleware/logger.middleware';

/**
 * Applies the global HTTP pipeline (security, prefix, versioning, guards,
 * filter, interceptor, validation) shared by `main.ts` and the e2e tests so
 * tests exercise the exact same behaviour as production.
 */
export function setupApp(app: INestApplication): void {
  const reflector = app.get(Reflector);

  app.use(helmet());
  app.use(loggerMiddleware);

  app.setGlobalPrefix(process.env.APP_PREFIX ?? 'api/v1', {
    // Keep the root path unprefixed so it can redirect to the Swagger docs.
    exclude: [{ path: '/', method: RequestMethod.GET }],
  });
  app.enableVersioning({ type: VersioningType.URI });

  app.useGlobalGuards(new JwtAuthGuard(reflector), new RolesGuard(reflector));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
}
