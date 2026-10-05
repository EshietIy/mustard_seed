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

  /** https://api.paystack.co in production; the built-in simulator elsewhere. */
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  PAYSTACK_BASE_URL!: string;

  /** sk_live_/sk_test_ for real Paystack; sk_sim_ for the simulator. Never logged. */
  @Matches(/^sk_(live|test|sim)_[A-Za-z0-9_]{8,}$/, {
    message: 'PAYSTACK_SECRET_KEY must look like sk_test_…, sk_live_… or sk_sim_…',
  })
  PAYSTACK_SECRET_KEY!: string;

  /** Where the simulator delivers webhooks (the backend's /api/v1/payments/webhook). */
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  PAYSTACK_WEBHOOK_URL?: string;

  /** Protects the simulator's /_control endpoints (required when the simulator is on). */
  @IsOptional()
  @IsString()
  @MinLength(16)
  SIMULATOR_CONTROL_KEY?: string;

  @Transform(toInt)
  @IsInt()
  @Min(1000)
  PAYSTACK_TIMEOUT_MS = 10_000;

  /** The customer site's origin, for payment return links (and email links later). */
  @Matches(EXACT_ORIGIN, {
    message: 'FRONTEND_BASE_URL must be an exact origin such as https://mustardseed.ng',
  })
  FRONTEND_BASE_URL!: string;

  /** How long an order may wait for payment before it expires. */
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  PAYMENT_WINDOW_MINUTES = 15;

  /**
   * mailgun: real sending (required in production). log: write emails to the log instead
   * (local development). memory: keep them in memory (automated tests only).
   */
  @IsIn(['mailgun', 'log', 'memory'])
  MAIL_PROVIDER: 'mailgun' | 'log' | 'memory' = 'log';

  @IsOptional()
  @IsString()
  @MinLength(10)
  MAILGUN_API_KEY?: string;

  /** The verified sending domain, e.g. mg.mustardseed.ng (or a sandbox domain). */
  @IsOptional()
  @Matches(/^[a-z0-9.-]+\.[a-z]{2,}$/i, { message: 'MAILGUN_DOMAIN must be a domain name' })
  MAILGUN_DOMAIN?: string;

  /** https://api.mailgun.net (US) or https://api.eu.mailgun.net (EU). */
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  MAILGUN_BASE_URL = 'https://api.mailgun.net';

  @Matches(/^[^<>]+ <[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>$/, {
    message: 'MAIL_FROM must look like: Mustard Seed Restaurant & Bar <orders@mustardseed.ng>',
  })
  MAIL_FROM = 'Mustard Seed Restaurant & Bar <orders@mustardseed.ng>';

  /** How often queued emails are sent/retried; 0 switches the dispatcher off (tests). */
  @Transform(toInt)
  @IsInt()
  @Min(0)
  EMAIL_DISPATCH_INTERVAL_MS = 30_000;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(10)
  EMAIL_MAX_ATTEMPTS = 5;

  /**
   * Estimated ready/arrival time, fixed when payment clears (until the owner confirms the
   * real formula): now + prep + (orders already in the kitchen × per-order) + delivery.
   */
  @Transform(toInt)
  @IsInt()
  @Min(0)
  ETA_PREP_MINUTES = 30;

  @Transform(toInt)
  @IsInt()
  @Min(0)
  ETA_PER_QUEUED_ORDER_MINUTES = 5;

  @Transform(toInt)
  @IsInt()
  @Min(0)
  ETA_DELIVERY_MINUTES = 25;

  /** How often unpaid orders are checked for expiry; 0 switches the sweep off (tests). */
  @Transform(toInt)
  @IsInt()
  @Min(0)
  PAYMENT_SWEEP_INTERVAL_MS = 60_000;

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

  /** Android app: access tokens are short-lived; the app refreshes them (AGENT.md 15). */
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(60)
  APP_ACCESS_TTL_MINUTES = 15;

  /** Android app: how long a refresh token stays valid if unused. */
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(90)
  APP_REFRESH_TTL_DAYS = 30;

  /** Oldest Android app version still served (x.y.z); older apps get 426. Unset = any. */
  @IsOptional()
  @Matches(/^\d+\.\d+\.\d+$/, { message: 'APP_MIN_VERSION must look like 1.2.3' })
  APP_MIN_VERSION?: string;

  /** Used only by the seed script that creates the first super admin. */
  @IsOptional()
  @Transform(toLowerTrimmed)
  @IsEmail()
  SEED_SUPER_ADMIN_EMAIL?: string;
}

function businessRuleErrors(config: AppConfig): string[] {
  const errors: string[] = [];
  const key = typeof config.PAYSTACK_SECRET_KEY === 'string' ? config.PAYSTACK_SECRET_KEY : '';
  if (config.PAYSTACK_SIMULATOR_ENABLED) {
    // The simulator uses its own key; a real Paystack key must never be reused here.
    if (key && !key.startsWith('sk_sim_')) {
      errors.push(
        'PAYSTACK_SECRET_KEY must be a simulator key (sk_sim_…) when the simulator is on',
      );
    }
    if (!config.SIMULATOR_CONTROL_KEY) {
      errors.push('SIMULATOR_CONTROL_KEY is required when the simulator is on');
    }
    if (!config.PAYSTACK_WEBHOOK_URL) {
      errors.push('PAYSTACK_WEBHOOK_URL is required when the simulator is on');
    }
  } else if (key.startsWith('sk_sim_')) {
    errors.push('PAYSTACK_SECRET_KEY must be sk_test_… or sk_live_… when the simulator is off');
  }
  if (config.MAIL_PROVIDER === 'mailgun') {
    if (!config.MAILGUN_API_KEY)
      errors.push('MAILGUN_API_KEY is required when MAIL_PROVIDER=mailgun');
    if (!config.MAILGUN_DOMAIN)
      errors.push('MAILGUN_DOMAIN is required when MAIL_PROVIDER=mailgun');
  }
  if (config.MAIL_PROVIDER === 'memory' && config.APP_ENV !== AppEnv.Test) {
    errors.push('MAIL_PROVIDER=memory is only allowed when APP_ENV=test');
  }
  if (config.APP_ENV === AppEnv.Production) {
    // Keyed off APP_ENV only, never NODE_ENV (AGENT.md §3.1).
    if (config.PAYSTACK_SIMULATOR_ENABLED) {
      errors.push('PAYSTACK_SIMULATOR_ENABLED must be false when APP_ENV=production (simulator)');
    }
    if (config.PAYSTACK_BASE_URL?.includes('/simulator')) {
      errors.push('PAYSTACK_BASE_URL must not point at the simulator when APP_ENV=production');
    }
    if (config.MAIL_PROVIDER !== 'mailgun') {
      errors.push('MAIL_PROVIDER must be mailgun in production');
    }
    if (key && !key.startsWith('sk_live_')) {
      errors.push('PAYSTACK_SECRET_KEY must be a live key (sk_live_…) in production');
    }
    if (
      typeof config.FRONTEND_BASE_URL === 'string' &&
      !config.FRONTEND_BASE_URL.startsWith('https://')
    ) {
      errors.push('FRONTEND_BASE_URL must use https in production');
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
  // `KEY=` (empty) in a .env file means "not set": drop it so defaults and optionality apply.
  const present = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => !(typeof v === 'string' && v.trim() === '')),
  );
  const config = plainToInstance(AppConfig, present, { excludeExtraneousValues: false });
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
