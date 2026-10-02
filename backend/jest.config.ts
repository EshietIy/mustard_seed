import type { Config } from 'jest';

const config: Config = {
  rootDir: 'src',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Module wiring, DI tokens and the bootstrap are exercised end to end by the BDD suite.
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.spec.ts',
    '!main.ts',
    '!app.factory.ts',
    '!**/*.module.ts',
    '!**/*.token.ts',
    '!**/testing/**',
  ],
  coverageDirectory: '../coverage',
  coverageThreshold: { global: { lines: 80, branches: 80, functions: 80, statements: 80 } },
};

export default config;
