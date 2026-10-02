import { After, Before, setDefaultTimeout, setWorldConstructor, World } from '@cucumber/cucumber';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Response } from 'supertest';
import { createApp } from '../../src/app.factory';
import { resetTestDatabase, testSupabaseEnv } from './test-database';
import { TestSupportModule } from './test-support.module';

setDefaultTimeout(15_000);

export type LogEntry = Record<string, unknown>;

export const DEFAULT_ENV: Record<string, string> = {
  APP_ENV: 'test',
  LOG_LEVEL: 'info',
  CORS_ALLOWED_ORIGINS: 'https://mustardseed.ng,http://localhost:5173',
  PAYSTACK_SIMULATOR_ENABLED: 'false',
  ...testSupabaseEnv(),
};

export class ApiWorld extends World {
  app?: NestExpressApplication;
  logs: LogEntry[] = [];
  response?: Response;
  startupError?: Error;
  matchedLog?: LogEntry;

  /** Starts a fresh app (fresh rate-limit state and logs) with the given env. */
  async start(env: Record<string, string>): Promise<void> {
    await this.stop();
    this.logs = [];
    this.startupError = undefined;
    const logStream = {
      write: (chunk: string): void => {
        for (const line of chunk.split('\n')) {
          if (line.trim()) this.logs.push(JSON.parse(line) as LogEntry);
        }
      },
    };
    this.app = await createApp(env, { logStream, extraModules: [TestSupportModule] });
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

Before(async function () {
  await resetTestDatabase();
});

After(async function (this: ApiWorld) {
  await this.stop();
});
