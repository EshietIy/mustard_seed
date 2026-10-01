import pino, { DestinationStream, Logger } from 'pino';
import type { AppConfig } from '../config/env.validation';

/**
 * Fields that must never reach the logs (AGENT.md §6). Request headers are already reduced by the
 * serializer; these paths are the safety net for anything logged explicitly.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.idToken',
  '*.jwt',
  '*.secret',
  '*.secretKey',
  '*.apiKey',
  '*.serviceRoleKey',
  '*.authorization',
  '*.cookie',
  '*.email',
  '*.card',
];

export function createRootLogger(config: AppConfig, stream?: DestinationStream): Logger {
  return pino(
    {
      level: config.LOG_LEVEL,
      base: { service: 'mustard-seed-api', env: config.APP_ENV },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    },
    stream ?? pino.destination({ fd: 1, sync: false }),
  );
}
