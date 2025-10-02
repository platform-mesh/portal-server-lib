/* eslint-disable @typescript-eslint/no-require-imports */
import baseConfig from './base.jest.config.js';

export default {
  ...baseConfig,
  rootDir: 'src',
  testRegex: '.spec.ts$',
  collectCoverage: true,
  reporters: ['default'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 95,
      lines: 95,
      statements: -3,
    },
  },
  coveragePathIgnorePatterns: ['/node_modules/', '/integration-tests/'],
  coverageDirectory: '../test-run-reports/coverage/unit',
  transformIgnorePatterns: [
    '/node_modules/(?!(@openmfp/portal-server-lib|graphql-request)/)',
  ],
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json',
        useESM: true,
      },
    ],
  },
  testEnvironment: 'node',
  passWithNoTests: true,
  roots: ['<rootDir>'],
  moduleNameMapper: {
    '^@openmfp/portal-lib(|/.*)$': '<rootDir>/libs/portal-lib/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  moduleFileExtensions: ['js', 'json', 'ts'],
};
