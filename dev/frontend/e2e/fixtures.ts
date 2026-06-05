/**
 * E2E 自定义 Fixture
 * 扩展 Playwright 的 test/page，提供预认证页面和 API 请求封装
 *
 * @example
 * import { test, expect } from './fixtures';
 *
 * test('首页加载', async ({ authenticatedPage }) => {
 *   await authenticatedPage.goto('/');
 *   await expect(authenticatedPage.locator('h1')).toBeVisible();
 * });
 */

import { test as base, type Page, type APIRequestContext } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:8100';

/** 封装后端 API 请求（绕过前端代理，直接调后端） */
class ApiClient {
  constructor(
    private request: APIRequestContext,
    private token: string,
  ) {}

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  async get(path: string) {
    const response = await this.request.get(`${API_URL}${path}`, {
      headers: this.headers(),
    });
    return response.json();
  }

  async post(path: string, body?: Record<string, unknown>) {
    const response = await this.request.post(`${API_URL}${path}`, {
      headers: this.headers(),
      data: body,
    });
    return response.json();
  }

  async delete(path: string) {
    const response = await this.request.delete(`${API_URL}${path}`, {
      headers: this.headers(),
    });
    return response.json();
  }
}

/**
 * 扩展的 test fixture 类型
 */
type TestFixtures = {
  /** 已认证的 Page（token 已注入 localStorage） */
  authenticatedPage: Page;

  /** 封装的后端 API 客户端（携带认证 token） */
  apiClient: ApiClient;

  /**
   * 切换到指定角色的用户
   * @param roleCode 角色编码（如 'admin', 'viewer', 'finance_staff'）
   */
  switchRole: (roleCode: string) => Promise<void>;
};

export const test = base.extend<TestFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // storageState 已在 global-setup 中生成，playwright.config.ts 中配置
    // page 自动携带认证 token，直接使用即可
    await use(page);
  },

  apiClient: async ({ request }, use) => {
    // 从 storageState 读取 token
    const storageState = await request.storageState();
    const origin = storageState.origins[0];
    const tokenItem = origin?.localStorage.find(item => item.name === 'auth_token');
    const token = tokenItem?.value ?? '';

    const client = new ApiClient(request, token);
    await use(client);
  },

  switchRole: async ({ page }, use) => {
    const switchRoleFn = async (roleCode: string) => {
      // 调用 dev-switch API 切换用户
      await page.evaluate(async ({ apiUrl, role }) => {
        const response = await fetch(`${apiUrl}/api/auth/dev-switch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roleCode: role }),
        });
        const data = await response.json();
        const newToken = data.token ?? data.data?.token;
        if (newToken) {
          localStorage.setItem('auth_token', newToken);
        }
      }, { apiUrl: API_URL, role: roleCode });

      // 刷新页面以应用新用户身份
      await page.reload({ waitUntil: 'domcontentloaded' });
    };

    await use(switchRoleFn);
  },
});

export { expect } from '@playwright/test';
