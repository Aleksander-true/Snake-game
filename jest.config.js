/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['**/*.test.ts'],
  testSequencer: '<rootDir>/tests/sequencer.js',
  moduleNameMapper: {
    '^(.+)\\.css$': '<rootDir>/tests/__mocks__/styleMock.js',
  },
};
