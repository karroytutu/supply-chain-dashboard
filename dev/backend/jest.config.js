/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        target: 'ES2020',
        module: 'commonjs',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        resolveJsonModule: true,
        types: ['jest', 'node'],
      },
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.types.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/app.ts',
    '!src/routes/**/*.ts',
    '!src/scripts/**/*.ts',
    '!src/db/migrate.ts',
    '!src/middleware/schemas/**/*.ts',
  ],
  // 覆盖率阈值（2026-06-04 Task 3-4 完成）：Statements 67%+, Branches 56%+, Functions 57%+, Lines 68%+
  // 从 58%/49%/47%/59% 提升至 67%/56%/57%/68%
  // 下一步目标：继续提升至 Statements 75%, Branches 65%, Functions 68%, Lines 75%
  coverageThreshold: {
    global: { branches: 56, functions: 57, lines: 68, statements: 67 },
  },
};
