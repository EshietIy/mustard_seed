import {
  After,
  AfterAll,
  Before,
  BeforeAll,
  setDefaultTimeout,
  setWorldConstructor,
  World,
} from '@cucumber/cucumber';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Response } from 'supertest';
import { createApp } from '../../src/app.factory';
import { startFakeGoogle, stopFakeGoogle, TEST_GOOGLE_CLIENT_ID } from './fake-google';
import { resetTestDatabase, testSupabaseEnv } from './test-database';
import { TestSupportModule } from './test-support.module';

setDefaultTimeout(15_000);

export type LogEntry = Record<string, unknown>;

export const DEFAULT_ENV: Record<string, string> = {
  APP_ENV: 'test',
  LOG_LEVEL: 'info',
  CORS_ALLOWED_ORIGINS: 'https://mustardseed.ng,http://localhost:5173',
  PAYSTACK_SIMULATOR_ENABLED: 'false',
  GOOGLE_CLIENT_ID: TEST_GOOGLE_CLIENT_ID,
  // Filled in BeforeAll once the fake Google key server is listening.
  GOOGLE_JWKS_URL: '',
  JWT_SECRET: 'bdd-test-secret-that-is-at-least-32-characters',
  ...testSupabaseEnv(),
};

/** Allowed browser origin used for state-changing requests in scenarios. */
export const SITE_ORIGIN = 'https://mustardseed.ng';

export class ApiWorld extends World {
  app?: NestExpressApplication;
  logs: LogEntry[] = [];
  response?: Response;
  startupError?: Error;
  matchedLog?: LogEntry;
  /** "name=value" of the session cookie, when signed in. */
  sessionCookie?: string;
  /** Session cookies of other named people, for multi-user scenarios. */
  sessions = new Map<string, string>();
  /** The app's "now"; undefined means the real time. */
  now?: Date;
  lastOrderId?: string;
  lastAudit?: Record<string, unknown>;

  /** Starts a fresh app (fresh rate-limit state and logs) with the given env. */
  async start(env: Record<string, string>): Promise<void> {
    await this.stop();
    this.logs = [];
    this.startupError = undefined;
    this.sessionCookie = undefined;
    this.sessions.clear();
    const logStream = {
      write: (chunk: string): void => {
        for (const line of chunk.split('\n')) {
          if (line.trim()) this.logs.push(JSON.parse(line) as LogEntry);
        }
      },
    };
    this.app = await createApp(env, {
      logStream,
      extraModules: [TestSupportModule],
      clock: () => this.now ?? new Date(),
    });
  }

  async stop(): Promise<void> {
    if (this.app) await this.app.close();
    this.app = undefined;
  }

  server(): Parameters<typeof import('supertest')>[0] {
    if (!this.app) throw new Error('The API is not running');
    return this.app.getHttpServer();
  }

  res(): Response {
    if (!this.response) throw new Error('No response recorded');
    return this.response;
  }
}

export function getPath(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (acc, key) =>
        acc !== null && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined,
      obj,
    );
}

setWorldConstructor(ApiWorld);

BeforeAll(async function () {
  DEFAULT_ENV.GOOGLE_JWKS_URL = await startFakeGoogle();
});

AfterAll(async function () {
  await stopFakeGoogle();
});

Before(async function () {
  await resetTestDatabase();
});

After(async function (this: ApiWorld) {
  await this.stop();
});
