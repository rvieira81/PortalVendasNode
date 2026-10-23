/** @type {import('jest').Config} */
const base = {
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  testEnvironment: 'node',
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/**/*.cli.ts', '!src/main.ts'],
};

module.exports = {
  projects: [
    { ...base, displayName: 'unit', roots: ['<rootDir>/src'], testRegex: '.*\\.spec\\.ts$' },
    {
      ...base,
      displayName: 'integracao',
      roots: ['<rootDir>/test'],
      testRegex: '.*\\.e2e-spec\\.ts$',
      globalSetup: '<rootDir>/test/setup/global-setup.ts',
    },
  ],
};
