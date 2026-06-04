import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.{spec,test}.{ts,tsx}'],
    css: {
      modules: {
        classNameStrategy: 'non-scoped',
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.types.ts',
        'src/**/*.d.ts',
        'src/setupTests.ts',
        'src/.umi/**',
        'src/.umi-production/**',
      ],
      // 覆盖率阈值（2026-06-04 更新）：从 ~4% 提升，作为防退化底线
      // 目标覆盖率：statements 50%, branches 30%
      thresholds: {
        branches: 7,
        functions: 5,
        lines: 6,
        statements: 6,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
