module.exports = {
  // Coverage ratchet: the measured values when this was introduced, floored to the
  // integer below so the gate catches a real regression without failing on
  // sub-percent variation. A floor to raise, never to lower -- if a change
  // legitimately reduces coverage, say so in the commit rather than editing this
  // quietly.
  coverageThreshold: {
    global: {
      statements: 58,
      branches: 37,
      functions: 73,
      lines: 58
    }
  },
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/__tests__/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
