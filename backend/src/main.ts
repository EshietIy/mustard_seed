import { existsSync } from 'node:fs';
import { createApp } from './app.factory';
import { APP_CONFIG } from './config/app-config.token';
import type { AppConfig } from './config/env.validation';

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const app = await createApp(process.env);
  app.enableShutdownHooks();
  const config = app.get<AppConfig>(APP_CONFIG);
  await app.listen(config.PORT);
}

main().catch((err: unknown) => {
  // The structured logger may not exist yet (e.g. invalid config), so write directly.
  process.stderr.write(
    `Fatal: failed to start\n${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
