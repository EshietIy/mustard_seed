import { plainToInstance, Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUrl,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum AppEnv {
  Local = 'local',
  Test = 'test',
  Staging = 'staging',
  Production = 'production',
}

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Exact origin: scheme + host (+ optional port). No path, no trailing slash, no wildcard. */
const EXACT_ORIGIN = /^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*(:\d{1,5})?$/;

const toInt = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;

const toStrictBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

const toList = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string'
    ? value
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : value;

export class AppConfig {
  @IsEnum(AppEnv)
  APP_ENV!: AppEnv;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsIn(LOG_LEVELS)
  LOG_LEVEL: LogLevel = 'info';

  /** Number of proxy hops to trust for client IPs (rate limiting). */
  @Transform(toInt)
  @IsInt()
  @Min(0)
  TRUST_PROXY = 0;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  THROTTLE_TTL_MS = 60_000;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  THROTTLE_LIMIT = 100;

  /** Limit for sign-in, order creation, payment initialisation and uploads. */
  @Transform(toInt)
  @IsInt()
  @Min(1)
  THROTTLE_STRICT_LIMIT = 10;

  @Transform(toList)
  @IsArray()
  @ArrayNotEmpty()
  @Matches(EXACT_ORIGIN, {
    each: true,
    message: 'CORS_ALLOWED_ORIGINS entries must be exact origins such as https://mustardseed.ng',
  })
  CORS_ALLOWED_ORIGINS!: string[];

  @Transform(toStrictBoolean)
  @IsBoolean()
  PAYSTACK_SIMULATOR_ENABLED = false;

  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  PAYSTACK_BASE_URL?: string;
}

function businessRuleErrors(config: AppConfig): string[] {
  const errors: string[] = [];
  if (config.APP_ENV === AppEnv.Production) {
    // Keyed off APP_ENV only, never NODE_ENV (AGENT.md §3.1).
    if (config.PAYSTACK_SIMULATOR_ENABLED) {
      errors.push('PAYSTACK_SIMULATOR_ENABLED must be false when APP_ENV=production (simulator)');
    }
    if (config.PAYSTACK_BASE_URL?.includes('/simulator')) {
      errors.push('PAYSTACK_BASE_URL must not point at the simulator when APP_ENV=production');
    }
    const insecure = config.CORS_ALLOWED_ORIGINS.filter((o) => !o.startsWith('https://'));
    if (insecure.length > 0) {
      errors.push(`CORS_ALLOWED_ORIGINS must use https in production: ${insecure.join(', ')}`);
    }
  }
  return errors;
}

/** Validates raw environment variables. Throws (fail fast) with every problem listed. */
export function validateEnv(raw: Record<string, unknown>): AppConfig {
  const config = plainToInstance(AppConfig, raw, { excludeExtraneousValues: false });
  const fieldErrors = validateSync(config, { whitelist: true, skipMissingProperties: false }).map(
    (e) => `${e.property}: ${Object.values(e.constraints ?? {}).join('; ')}`,
  );
  const errors = fieldErrors.length > 0 ? fieldErrors : businessRuleErrors(config);
  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n  - ${errors.join('\n  - ')}`);
  }
  return config;
}
