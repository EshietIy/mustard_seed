import { AppEnv, validateEnv } from './env.validation';

const supabase = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test_key_0123456789',
  GOOGLE_CLIENT_ID: '1234567890-abc.apps.googleusercontent.com',
  JWT_SECRET: 'a'.repeat(48),
};

const base = {
  APP_ENV: 'local',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
  ...supabase,
};

const prodSupabase = { ...supabase, SUPABASE_URL: 'https://abc.supabase.co' };

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
    expect(
      validateEnv({ ...base, PAYSTACK_SIMULATOR_ENABLED: 'true' }).PAYSTACK_SIMULATOR_ENABLED,
    ).toBe(true);
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
      expect(() => validateEnv({ ...prod, PAYSTACK_SIMULATOR_ENABLED: 'true' })).toThrow(
        /simulator/i,
      );
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
        PAYSTACK_SIMULATOR_ENABLED: 'true',
        PAYSTACK_BASE_URL: 'https://staging-api.mustardseed.ng/simulator/paystack',
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
});
