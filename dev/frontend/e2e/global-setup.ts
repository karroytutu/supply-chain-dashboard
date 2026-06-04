/**
 * E2E 全局 Setup
 * 在所有测试前执行：调用 dev-login API 获取 token，保存为 storageState
 * 后续所有测试共享此认证状态，无需重复登录
 *
 * 前置条件：后端服务运行在 http://localhost:8100 且 NODE_ENV=development
 */

import { type FullConfig } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:8100';
const AUTH_DIR = './e2e/.auth';
const STORAGE_STATE_PATH = `${AUTH_DIR}/storage-state.json`;

/**
 * 调用 dev-login API 获取 JWT token
 * dev-login 仅在 NODE_ENV=development 时可用
 */
async function devLogin(): Promise<string> {
  const response = await fetch(`${API_URL}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(
      `dev-login 失败 (${response.status}): ${await response.text()}\n` +
      `请确认后端服务运行在 ${API_URL} 且 NODE_ENV=development`
    );
  }

  const data = await response.json();
  // 支持两种响应格式：{ token } 或 { data: { token } }
  const token = data.token ?? data.data?.token;
  if (!token) {
    throw new Error('dev-login 响应中未找到 token');
  }
  return token;
}

/**
 * 将 token 保存为 Playwright storageState 格式
 */
async function saveStorageState(token: string): Promise<void> {
  const { mkdir } = await import('fs/promises');
  await mkdir(AUTH_DIR, { recursive: true });

  const storageState = {
    cookies: [],
    origins: [
      {
        origin: process.env.BASE_URL ?? 'http://localhost:3100',
        localStorage: [
          { name: 'auth_token', value: token },
        ],
      },
    ],
  };

  await import('fs/promises').then(fs =>
    fs.writeFile(STORAGE_STATE_PATH, JSON.stringify(storageState, null, 2))
  );

  console.log(`[E2E Setup] 认证 token 已保存到 ${STORAGE_STATE_PATH}`);
}

async function globalSetup(_config: FullConfig): Promise<void> {
  console.log('[E2E Setup] 开始全局设置...');
  console.log(`[E2E Setup] API URL: ${API_URL}`);

  try {
    const token = await devLogin();
    await saveStorageState(token);
    console.log('[E2E Setup] ✓ 认证成功，所有测试将共享此登录状态');
  } catch (error) {
    console.error('[E2E Setup] ✗ 全局 setup 失败:', (error as Error).message);
    console.error('[E2E Setup] 提示：E2E 测试需要后端服务运行在开发模式');
    console.error('[E2E Setup] 启动命令：cd dev/backend && npm run dev');
    process.exit(1);
  }
}

export default globalSetup;
