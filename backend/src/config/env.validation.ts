import { plainToInstance, Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
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

/** Google's public signing keys for ID tokens. */
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

const toLowerTrimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

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

  /** Supabase project URL. Also the base of public image URLs. */
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  SUPABASE_URL!: string;

  /** Service-role (secret) key. Backend only; never logged, never sent to the frontend. */
  @IsString()
  @MinLength(20)
  SUPABASE_SERVICE_ROLE_KEY!: string;

  @Matches(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/, {
    message: 'SUPABASE_STORAGE_BUCKET must be a lowercase bucket name such as site-images',
  })
  SUPABASE_STORAGE_BUCKET = 'site-images';

  /** Per-request timeout for database calls, so a slow upstream fails fast (503). */
  @Transform(toInt)
  @IsInt()
  @Min(100)
  SUPABASE_TIMEOUT_MS = 5000;

  /** OAuth client ID (public). ID tokens must be issued for exactly this audience. */
  @Matches(/^[\w-]+\.apps\.googleusercontent\.com$/, {
    message: 'GOOGLE_CLIENT_ID must look like <id>.apps.googleusercontent.com',
  })
  GOOGLE_CLIENT_ID!: string;

  /** Where Google's signing keys are fetched from. Only tests point this elsewhere. */
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  GOOGLE_JWKS_URL = GOOGLE_JWKS_URL;

  /** Signs our own session tokens. Never logged; rotate to sign everyone out. */
  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  SESSION_TTL_HOURS_CUSTOMER = 168;

  /** Staff sessions are shorter-lived. */
  @Transform(toInt)
  @IsInt()
  @Min(1)
  SESSION_TTL_HOURS_STAFF = 12;

  /** Used only by the seed script that creates the first super admin. */
  @IsOptional()
  @Transform(toLowerTrimmed)
  @IsEmail()
  SEED_SUPER_ADMIN_EMAIL?: string;
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
    if (config.GOOGLE_JWKS_URL !== GOOGLE_JWKS_URL) {
      errors.push(`GOOGLE_JWKS_URL must be ${GOOGLE_JWKS_URL} in production`);
    }
    if (typeof config.SUPABASE_URL === 'string' && !config.SUPABASE_URL.startsWith('https://')) {
      errors.push('SUPABASE_URL must use https in production');
    }
    const origins = Array.isArray(config.CORS_ALLOWED_ORIGINS) ? config.CORS_ALLOWED_ORIGINS : [];
    const insecure = origins.filter((o) => !o.startsWith('https://'));
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
  // Report everything at once so a broken deployment is fixed in one pass.
  const errors = [...fieldErrors, ...businessRuleErrors(config)];
  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n  - ${errors.join('\n  - ')}`);
  }
  return config;
}
