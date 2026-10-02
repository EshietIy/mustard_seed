import { DynamicModule, RequestMethod, Type, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import type { DestinationStream, Logger } from 'pino';
import { AppModule } from './app.module';
import type { Clock } from './common/clock';
import { createCorsOptions } from './common/cors';
import { validationExceptionFactory } from './common/validation';
import { AppEnv, validateEnv } from './config/env.validation';
import { createHttpLogger } from './logging/http-logger';
import { createRootLogger } from './logging/logger';
import { PinoNestLogger } from './logging/nest-logger';

export interface CreateAppOptions {
  /** Log destination; tests pass an in-memory stream. Defaults to stdout. */
  logStream?: DestinationStream;
  /** Additional modules (tests only). */
  extraModules?: Array<Type | DynamicModule>;
  /** Source of "now" (tests set the time of day for opening-hours rules). */
  clock?: Clock;
}

/**
 * Builds and initialises the application. Used by main.ts and by the BDD suite, so tests exercise
 * exactly the production wiring. Throws (fail fast) on invalid configuration.
 */
export async function createApp(
  env: Record<string, string | undefined>,
  options: CreateAppOptions = {},
): Promise<NestExpressApplication> {
  const config = validateEnv(env);
  const logger = createRootLogger(config, options.logStream);

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register(config, logger, options.extraModules, options.clock),
    { logger: new PinoNestLogger(logger), rawBody: true, abortOnError: false },
  );

  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);

  // Order matters: logging first so every request (including rejected ones) is recorded.
  app.use(createHttpLogger(logger));
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
      },
      strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginResourcePolicy: { policy: 'same-site' },
      frameguard: { action: 'deny' },
    }),
  );
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.enableCors((req: Request & { log?: Logger }, cb) => {
    cb(
      null,
      createCorsOptions(config.CORS_ALLOWED_ORIGINS, (origin) => {
        (req.log ?? logger).warn(
          { event: 'cors.rejected', origin, outcome: 'FAILED' },
          'CORS origin rejected',
        );
      }),
    );
  });

  app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  if (config.APP_ENV !== AppEnv.Production) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Mustard Seed API').setVersion('1').build(),
    );
    // JSON spec only: the Swagger UI would need a relaxed CSP.
    SwaggerModule.setup('api/docs', app, document, { ui: false, raw: ['json'] });
  }

  await app.init();
  return app;
}
