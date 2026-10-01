import { AppEnv, validateEnv } from './env.validation';

const base = {
  APP_ENV: 'local',
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
};

describe('validateEnv', () => {
  it.each(['local', 'test', 'staging', 'production'])('accepts APP_ENV=%s', (appEnv) => {
    const env = validateEnv({
      ...base,
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
    expect(() => validateEnv({ CORS_ALLOWED_ORIGINS: 'https://mustardseed.ng' })).toThrow(
      /APP_ENV/,
    );
  });

  it('fails when APP_ENV is not one of the four values', () => {
    expect(() => validateEnv({ ...base, APP_ENV: 'development' })).toThrow(/APP_ENV/);
  });

  it('fails when CORS_ALLOWED_ORIGINS is missing', () => {
    expect(() => validateEnv({ APP_ENV: 'local' })).toThrow(/CORS_ALLOWED_ORIGINS/);
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
      validateEnv({ APP_ENV: 'production', CORS_ALLOWED_ORIGINS: 'http://mustardseed.ng' }),
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
    const prod = { APP_ENV: 'production', CORS_ALLOWED_ORIGINS: 'https://mustardseed.ng' };

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
});
