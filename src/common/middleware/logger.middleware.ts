import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const logger = new Logger('HTTP');

/**
 * Functional middleware that logs one line per request with method, path,
 * status code, and duration. Registered globally via `app.use()` so it does
 * not depend on route-path matching.
 */
export function loggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();
  const { method, originalUrl } = req;

  res.on('finish', () => {
    const { statusCode } = res;
    const duration = Date.now() - start;
    const message = `${method} ${originalUrl} ${statusCode} - ${duration}ms`;
    if (statusCode >= 500) logger.error(message);
    else if (statusCode >= 400) logger.warn(message);
    else logger.log(message);
  });

  next();
}
