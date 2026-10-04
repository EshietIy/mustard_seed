import { fileURLToPath, URL } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ command, mode }) => {
  // Fail the build rather than ship a bundle that cannot reach the API.
  if (command === 'build' && !loadEnv(mode, process.cwd()).VITE_API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL must be set to build the frontend (see .env.example).');
  }
  return {
    plugins: [vue()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.spec.ts'],
      env: { VITE_API_BASE_URL: 'http://api.test/api/v1' },
      // Tests take well under a second, but a loaded machine (WSL, CI, Docker e2e running
      // alongside) can starve the first mount past the 5s default.
      testTimeout: 15_000,
      restoreMocks: true,
      unstubGlobals: true,
      coverage: {
        include: ['src/**/*.{ts,vue}'],
        exclude: ['src/**/*.spec.ts', 'src/main.ts', 'src/env.d.ts'],
        thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
      },
    },
  };
});
