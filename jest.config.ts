/* eslint-disable @typescript-eslint/no-require-imports */
const baseConfig = require('./base.jest.config.cjs');

module.exports = {
  ...baseConfig,
  rootDir: 'src',
  testRegex: '.spec.ts$',
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
  coverageDirectory: '../test-run-reports/coverage/unit',
  transformIgnorePatterns: ['node_modules/(?!@openmfp/portal-server-lib/)'],
};
