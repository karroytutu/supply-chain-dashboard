/**
 * Playwright E2E 测试配置
 * 文档：https://playwright.dev/docs/test-configuration
 */
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100';
const API_URL = process.env.API_URL ?? 'http://localhost:8100';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',

  /* 全局超时：单个测试最多 30 秒 */
  timeout: 30_000,
  /* 断言超时：expect() 最多等待 5 秒 */
  expect: { timeout: 5_000 },

  /* 并行执行：本地 2 个 worker，CI 环境无限制 */
  workers: process.env.CI ? 1 : 2,

  /* 失败不重试（调试友好），CI 环境重试 1 次 */
  retries: process.env.CI ? 1 : 0,

  /* 报告器 */
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  /* 全局配置 */
  use: {
    baseURL: BASE_URL,
    /* 失败时截图 */
    screenshot: 'only-on-failure',
    /* 失败时录制 trace */
    trace: 'retain-on-failure',
    /* 视频：仅 CI 录制 */
    video: process.env.CI ? 'retain-on-failure' : 'off',
    /* 全局 storageState（由 global-setup 生成） */
    storageState: 'e2e/.auth/storage-state.json',
  },

  /* 全局 setup：认证状态持久化 */
  globalSetup: './e2e/global-setup.ts',

  /* 浏览器配置 */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    /* Firefox 仅在 CI 启用，节省本地时间 */
    ...(process.env.CI
      ? [
          {
            name: 'firefox',
            use: {
              ...devices['Desktop Firefox'],
              viewport: { width: 1440, height: 900 },
            },
          },
        ]
      : []),
  ],

  /* 运行测试前不自动启动服务器（假设已在运行） */
  /* 如需自动启动，取消下方注释：
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  */
});

export { BASE_URL, API_URL };
