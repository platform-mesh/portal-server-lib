/* eslint-disable @typescript-eslint/no-require-imports */
const baseConfig = require('./base.jest.config.cjs');

module.exports = {
  ...baseConfig,
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.test.json',
        useESM: true,
      },
    ],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  passWithNoTests: true,
  roots: ['<rootDir>/src/'],
  moduleNameMapper: {
    '^@openmfp/portal-lib(|/.*)$': '<rootDir>/libs/portal-lib/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  transformIgnorePatterns: [
    '/node_modules/(?!(@openmfp/portal-server-lib|graphql-request)/)',
  ],
  collectCoverage: true,
  reporters: ['default'],
  coverageThreshold: {
    global: {
      branches: 78,
      functions: 80,
      lines: 95,
      statements: -10,
    },
  },
  coveragePathIgnorePatterns: ['/node_modules/', '/integration-tests/'],
};
