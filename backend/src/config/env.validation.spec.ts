import { AppEnv, validateEnv } from './env.validation';

const supabase = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test_key_0123456789',
  GOOGLE_CLIENT_ID: '1234567890-abc.apps.googleusercontent.com',
  JWT_SECRET: 'a'.repeat(48),
  PAYSTACK_BASE_URL: 'https://api.paystack.co',
  PAYSTACK_SECRET_KEY: 'sk_test_0123456789abcdef',
  FRONTEND_BASE_URL: 'http://localhost:5173',
};

/** Settings that come together whenever the built-in simulator is on. */
const simulator = {
  PAYSTACK_SIMULATOR_ENABLED: 'true',
  PAYSTACK_SECRET_KEY: 'sk_sim_0123456789abcdef',
  PAYSTACK_BASE_URL: 'http://localhost:3000/simulator/paystack',
  PAYSTACK_WEBHOOK_URL: 'http://localhost:3000/api/v1/payments/webhook',
  SIMULATOR_CONTROL_KEY: 'control-key-0123456789',
};

const base = {
  APP_ENV: 'local',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
  ...supabase,
};

const prodSupabase = {
  ...supabase,
  // Production always sends real email.
  MAIL_PROVIDER: 'mailgun',
  MAILGUN_API_KEY: 'test-mailgun-key-not-real',
  MAILGUN_DOMAIN: 'mg.mustardseed.ng',
  SUPABASE_URL: 'https://abc.supabase.co',
  PAYSTACK_SECRET_KEY: 'sk_live_0123456789abcdef',
  FRONTEND_BASE_URL: 'https://mustardseed.ng',
};

describe('validateEnv', () => {
  it.each(['local', 'test', 'staging', 'production'])('accepts APP_ENV=%s', (appEnv) => {
    const env = validateEnv({
      ...base,
      ...prodSupabase,
      APP_ENV: appEnv,
      CORS_ALLOWED_ORIGINS: 'https://mustardseed.ng',
    });
    expect(env.APP_ENV).toBe(appEnv);
  });

  it('applies defaults', () => {
    const env = validateEnv(base);
    expect(env).toMatchObject({
      PORT: 3000,
      LOG_LEVEL: 'info',
      TRUST_PROXY: 0,
      THROTTLE_TTL_MS: 60_000,
      THROTTLE_LIMIT: 100,
      THROTTLE_STRICT_LIMIT: 10,
      PAYSTACK_SIMULATOR_ENABLED: false,
    });
  });

  it('defaults the app token lifetimes and accepts an x.y.z minimum app version', () => {
    const env = validateEnv(base);
    expect(env.APP_ACCESS_TTL_MINUTES).toBe(15);
    expect(env.APP_REFRESH_TTL_DAYS).toBe(30);
    expect(env.APP_MIN_VERSION).toBeUndefined();
    expect(validateEnv({ ...base, APP_MIN_VERSION: '1.2.3' }).APP_MIN_VERSION).toBe('1.2.3');
    expect(validateEnv({ ...base, APP_MIN_VERSION: '' }).APP_MIN_VERSION).toBeUndefined();
    expect(() => validateEnv({ ...base, APP_MIN_VERSION: 'v1' })).toThrow(/APP_MIN_VERSION/);
  });

  it('fails when APP_ENV is missing', () => {
    expect(() =>
      validateEnv({ ...supabase, CORS_ALLOWED_ORIGINS: 'https://mustardseed.ng' }),
    ).toThrow(/APP_ENV/);
  });

  it('fails when APP_ENV is not one of the four values', () => {
    expect(() => validateEnv({ ...base, APP_ENV: 'development' })).toThrow(/APP_ENV/);
  });

  it('fails when CORS_ALLOWED_ORIGINS is missing', () => {
    expect(() => validateEnv({ ...supabase, APP_ENV: 'local' })).toThrow(/CORS_ALLOWED_ORIGINS/);
  });

  it('parses a comma-separated origin list', () => {
    const env = validateEnv({
      ...base,
      CORS_ALLOWED_ORIGINS: 'https://mustardseed.ng, http://localhost:5173',
    });
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(['https://mustardseed.ng', 'http://localhost:5173']);
  });

  it.each([
    '*',
    'https://*.mustardseed.ng',
    'https://mustardseed.ng/',
    'mustardseed.ng',
    'https://mustardseed.ng/path',
  ])('rejects the non-exact origin %s', (origin) => {
    expect(() => validateEnv({ ...base, CORS_ALLOWED_ORIGINS: origin })).toThrow(
      /CORS_ALLOWED_ORIGINS/,
    );
  });

  it('rejects plain http origins in production', () => {
    expect(() =>
      validateEnv({
        ...prodSupabase,
        APP_ENV: 'production',
        CORS_ALLOWED_ORIGINS: 'http://mustardseed.ng',
      }),
    ).toThrow(/https/);
  });

  it('parses PAYSTACK_SIMULATOR_ENABLED strictly', () => {
    expect(validateEnv({ ...base, ...simulator }).PAYSTACK_SIMULATOR_ENABLED).toBe(true);
    expect(
      validateEnv({ ...base, PAYSTACK_SIMULATOR_ENABLED: 'false' }).PAYSTACK_SIMULATOR_ENABLED,
    ).toBe(false);
    expect(() => validateEnv({ ...base, PAYSTACK_SIMULATOR_ENABLED: 'yes' })).toThrow(
      /PAYSTACK_SIMULATOR_ENABLED/,
    );
  });

  describe('production simulator guard', () => {
    const prod = {
      ...prodSupabase,
      APP_ENV: 'production',
      CORS_ALLOWED_ORIGINS: 'https://mustardseed.ng',
    };

    it('refuses production with the simulator enabled', () => {
      expect(() => validateEnv({ ...prod, ...simulator })).toThrow(/simulator/i);
    });

    it('refuses production when PAYSTACK_BASE_URL points at the simulator', () => {
      expect(() =>
        validateEnv({
          ...prod,
          PAYSTACK_BASE_URL: 'https://api.example.com/simulator/paystack',
        }),
      ).toThrow(/simulator/i);
    });

    it('allows production with the real Paystack URL', () => {
      const env = validateEnv({ ...prod, PAYSTACK_BASE_URL: 'https://api.paystack.co' });
      expect(env.APP_ENV).toBe(AppEnv.Production);
    });

    it('ignores NODE_ENV: staging with NODE_ENV=production may run the simulator', () => {
      const env = validateEnv({
        ...prodSupabase,
        APP_ENV: 'staging',
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: 'https://staging.mustardseed.ng',
        ...simulator,
        PAYSTACK_BASE_URL: 'https://staging-api.mustardseed.ng/simulator/paystack',
        FRONTEND_BASE_URL: 'https://staging.mustardseed.ng',
      });
      expect(env.PAYSTACK_SIMULATOR_ENABLED).toBe(true);
    });
  });

  it('rejects an invalid PAYSTACK_BASE_URL', () => {
    expect(() => validateEnv({ ...base, PAYSTACK_BASE_URL: 'not a url' })).toThrow(
      /PAYSTACK_BASE_URL/,
    );
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => validateEnv({ ...base, PORT: 'abc' })).toThrow(/PORT/);
  });

  describe('Supabase', () => {
    it('applies the default bucket and timeout', () => {
      const env = validateEnv(base);
      expect(env.SUPABASE_STORAGE_BUCKET).toBe('site-images');
      expect(env.SUPABASE_TIMEOUT_MS).toBe(5000);
    });

    it.each(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])('fails when %s is missing', (key) => {
      const env: Record<string, string> = { ...base };
      delete env[key];
      expect(() => validateEnv(env)).toThrow(new RegExp(key));
    });

    it('rejects a malformed SUPABASE_URL', () => {
      expect(() => validateEnv({ ...base, SUPABASE_URL: 'not-a-url' })).toThrow(/SUPABASE_URL/);
    });

    it('rejects an implausibly short service-role key', () => {
      expect(() => validateEnv({ ...base, SUPABASE_SERVICE_ROLE_KEY: 'short' })).toThrow(
        /SUPABASE_SERVICE_ROLE_KEY/,
      );
    });

    it('rejects an invalid bucket name', () => {
      expect(() => validateEnv({ ...base, SUPABASE_STORAGE_BUCKET: 'Bad Bucket!' })).toThrow(
        /SUPABASE_STORAGE_BUCKET/,
      );
    });

    it('requires https for Supabase in production', () => {
      expect(() =>
        validateEnv({
          ...supabase,
          APP_ENV: 'production',
          CORS_ALLOWED_ORIGINS: 'https://mustardseed.ng',
        }),
      ).toThrow(/SUPABASE_URL must use https/);
    });

    it('reports business-rule problems alongside field errors', () => {
      expect(() =>
        validateEnv({
          APP_ENV: 'production',
          CORS_ALLOWED_ORIGINS: 'https://mustardseed.ng',
          PAYSTACK_SIMULATOR_ENABLED: 'true',
        }),
      ).toThrow(/SUPABASE_URL[\s\S]*PAYSTACK_SIMULATOR_ENABLED/);
    });
  });

  describe('auth', () => {
    it('applies auth defaults', () => {
      const env = validateEnv(base);
      expect(env).toMatchObject({
        GOOGLE_JWKS_URL: 'https://www.googleapis.com/oauth2/v3/certs',
        SESSION_TTL_HOURS_CUSTOMER: 168,
        SESSION_TTL_HOURS_STAFF: 12,
      });
      expect(env.SEED_SUPER_ADMIN_EMAIL).toBeUndefined();
    });

    it.each(['GOOGLE_CLIENT_ID', 'JWT_SECRET'])('fails when %s is missing', (key) => {
      const env: Record<string, string> = { ...base };
      delete env[key];
      expect(() => validateEnv(env)).toThrow(new RegExp(key));
    });

    it('rejects a malformed Google client ID', () => {
      expect(() => validateEnv({ ...base, GOOGLE_CLIENT_ID: 'my-client' })).toThrow(
        /GOOGLE_CLIENT_ID/,
      );
    });

    it('rejects a JWT secret shorter than 32 characters', () => {
      expect(() => validateEnv({ ...base, JWT_SECRET: 'short-secret' })).toThrow(/JWT_SECRET/);
    });

    it('rejects an invalid seed email', () => {
      expect(() => validateEnv({ ...base, SEED_SUPER_ADMIN_EMAIL: 'not-an-email' })).toThrow(
        /SEED_SUPER_ADMIN_EMAIL/,
      );
    });

    it('treats an empty value (KEY= in .env) as not set', () => {
      const env = validateEnv({ ...base, SEED_SUPER_ADMIN_EMAIL: '', PAYSTACK_WEBHOOK_URL: '  ' });
      expect(env.SEED_SUPER_ADMIN_EMAIL).toBeUndefined();
      expect(env.PAYSTACK_WEBHOOK_URL).toBeUndefined();
    });

    it('still reports an empty required value as missing', () => {
      expect(() => validateEnv({ ...base, JWT_SECRET: '' })).toThrow(/JWT_SECRET/);
    });

    it('lower-cases the seed email', () => {
      expect(
        validateEnv({ ...base, SEED_SUPER_ADMIN_EMAIL: ' Owner@MustardSeed.ng ' })
          .SEED_SUPER_ADMIN_EMAIL,
      ).toBe('owner@mustardseed.ng');
    });

    it('allows a test JWKS URL outside production', () => {
      expect(
        validateEnv({ ...base, GOOGLE_JWKS_URL: 'http://127.0.0.1:4999/certs' }).GOOGLE_JWKS_URL,
      ).toBe('http://127.0.0.1:4999/certs');
    });

    it("requires Google's real JWKS URL in production", () => {
      expect(() =>
        validateEnv({
          ...prodSupabase,
          APP_ENV: 'production',
          CORS_ALLOWED_ORIGINS: 'https://mustardseed.ng',
          GOOGLE_JWKS_URL: 'https://evil.example.com/certs',
        }),
      ).toThrow(/GOOGLE_JWKS_URL/);
    });
  });

  describe('payments', () => {
    it('applies payment defaults', () => {
      expect(validateEnv(base)).toMatchObject({
        PAYMENT_WINDOW_MINUTES: 15,
        PAYMENT_SWEEP_INTERVAL_MS: 60_000,
        PAYSTACK_TIMEOUT_MS: 10_000,
      });
    });

    it.each(['PAYSTACK_BASE_URL', 'PAYSTACK_SECRET_KEY', 'FRONTEND_BASE_URL'])(
      'fails when %s is missing',
      (key) => {
        const env: Record<string, string> = { ...base };
        delete env[key];
        expect(() => validateEnv(env)).toThrow(new RegExp(key));
      },
    );

    it('requires an exact frontend origin', () => {
      expect(() =>
        validateEnv({ ...base, FRONTEND_BASE_URL: 'http://localhost:5173/app' }),
      ).toThrow(/FRONTEND_BASE_URL/);
    });

    it('allows the sweep to be switched off with 0', () => {
      expect(
        validateEnv({ ...base, PAYMENT_SWEEP_INTERVAL_MS: '0' }).PAYMENT_SWEEP_INTERVAL_MS,
      ).toBe(0);
    });

    it('requires a simulator key (sk_sim_) when the simulator is on, never a real one', () => {
      expect(() =>
        validateEnv({ ...base, ...simulator, PAYSTACK_SECRET_KEY: 'sk_test_0123456789abcdef' }),
      ).toThrow(/sk_sim_/);
    });

    it('requires a real key (sk_test_ / sk_live_) when the simulator is off', () => {
      expect(() =>
        validateEnv({ ...base, PAYSTACK_SECRET_KEY: 'sk_sim_0123456789abcdef' }),
      ).toThrow(/sk_test_/);
    });

    it.each(['SIMULATOR_CONTROL_KEY', 'PAYSTACK_WEBHOOK_URL'])(
      'requires %s when the simulator is on',
      (key) => {
        const env: Record<string, string> = { ...base, ...simulator };
        delete env[key];
        expect(() => validateEnv(env)).toThrow(new RegExp(key));
      },
    );

    it('rejects a short control key', () => {
      expect(() => validateEnv({ ...base, ...simulator, SIMULATOR_CONTROL_KEY: 'short' })).toThrow(
        /SIMULATOR_CONTROL_KEY/,
      );
    });

    it('requires a live key and https frontend in production', () => {
      const prod = {
        ...prodSupabase,
        APP_ENV: 'production',
        CORS_ALLOWED_ORIGINS: 'https://mustardseed.ng',
      };
      expect(() =>
        validateEnv({ ...prod, PAYSTACK_SECRET_KEY: 'sk_test_0123456789abcdef' }),
      ).toThrow(/sk_live_/);
      expect(() => validateEnv({ ...prod, FRONTEND_BASE_URL: 'http://mustardseed.ng' })).toThrow(
        /FRONTEND_BASE_URL must use https/,
      );
    });
  });

  describe('email', () => {
    const mailgun = {
      MAIL_PROVIDER: 'mailgun',
      MAILGUN_API_KEY: 'test-mailgun-key-not-real',
      MAILGUN_DOMAIN: 'mg.mustardseed.ng',
    };

    it('defaults to logging emails locally, with sensible delivery and ETA settings', () => {
      expect(validateEnv(base)).toMatchObject({
        MAIL_PROVIDER: 'log',
        MAIL_FROM: 'Mustard Seed Restaurant & Bar <orders@mustardseed.ng>',
        MAILGUN_BASE_URL: 'https://api.mailgun.net',
        EMAIL_DISPATCH_INTERVAL_MS: 30_000,
        EMAIL_MAX_ATTEMPTS: 5,
        ETA_PREP_MINUTES: 30,
        ETA_PER_QUEUED_ORDER_MINUTES: 5,
        ETA_DELIVERY_MINUTES: 25,
      });
    });

    it('accepts Mailgun settings, including the EU region', () => {
      expect(
        validateEnv({ ...base, ...mailgun, MAILGUN_BASE_URL: 'https://api.eu.mailgun.net' }),
      ).toMatchObject({
        MAIL_PROVIDER: 'mailgun',
        MAILGUN_BASE_URL: 'https://api.eu.mailgun.net',
      });
    });

    it.each(['MAILGUN_API_KEY', 'MAILGUN_DOMAIN'])('requires %s for Mailgun', (key) => {
      const env: Record<string, string> = { ...base, ...mailgun };
      delete env[key];
      expect(() => validateEnv(env)).toThrow(new RegExp(key));
    });

    it('rejects an unknown provider and a malformed From', () => {
      expect(() => validateEnv({ ...base, MAIL_PROVIDER: 'sendgrid' })).toThrow(/MAIL_PROVIDER/);
      expect(() => validateEnv({ ...base, MAIL_FROM: 'orders@mustardseed.ng' })).toThrow(
        /MAIL_FROM/,
      );
    });

    it('only allows the in-memory provider in tests', () => {
      expect(validateEnv({ ...base, APP_ENV: 'test', MAIL_PROVIDER: 'memory' }).MAIL_PROVIDER).toBe(
        'memory',
      );
      expect(() => validateEnv({ ...base, MAIL_PROVIDER: 'memory' })).toThrow(
        /MAIL_PROVIDER=memory/,
      );
    });

    it('requires Mailgun in production', () => {
      const prod = {
        ...prodSupabase,
        APP_ENV: 'production',
        CORS_ALLOWED_ORIGINS: 'https://mustardseed.ng',
      };
      expect(() => validateEnv({ ...prod, MAIL_PROVIDER: 'log' })).toThrow(
        /MAIL_PROVIDER must be mailgun/,
      );
      expect(validateEnv({ ...prod, ...mailgun }).MAIL_PROVIDER).toBe('mailgun');
    });
  });
});
