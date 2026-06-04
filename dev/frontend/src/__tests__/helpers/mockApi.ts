/**
 * 前端 API Mock 工具
 * 提供 umi model mock、API 响应 mock 等常用方法
 *
 * @example
 * import { mockUseModel } from '../__tests__/helpers/mockApi';
 *
 * // Mock auth model 返回管理员用户
 * mockUseModel('auth', {
 *   currentUser: { id: 1, name: 'Admin', roles: ['admin'] },
 * });
 */

import { vi } from 'vitest';

/**
 * Mock umi 的 useModel hook
 * @param modelName model 名称（如 'auth'）
 * @param data model 返回的数据
 */
export function mockUseModel(modelName: string, data: Record<string, unknown>): void {
  vi.mock('umi', async (importOriginal) => {
    const original = await importOriginal<Record<string, unknown>>();
    return {
      ...original,
      useModel: vi.fn((name: string) => {
        if (name === modelName) return data;
        return {};
      }),
      history: { push: vi.fn(), replace: vi.fn(), goBack: vi.fn() },
      useParams: vi.fn(() => ({})),
      useSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]),
    };
  });
}

/**
 * 创建 mock API 成功响应
 * @param data 响应数据
 */
export function mockApiSuccess<T>(data: T): { success: true; data: T } {
  return { success: true, data };
}

/**
 * 创建 mock API 错误响应
 * @param message 错误消息
 * @param code 错误码（默认 500）
 */
export function mockApiError(message: string, code = 500): { success: false; message: string; code: number } {
  return { success: false, message, code };
}

/**
 * Mock 整个 API 模块，将所有导出函数替换为 vi.fn()
 * @param modulePath API 模块路径（如 '@/services/api/oa'）
 * @param overrides 需要自定义实现的函数名和实现
 *
 * @example
 * mockApiModule('@/services/api/ar-collection', {
 *   getCollectionTasks: vi.fn().mockResolvedValue(mockApiSuccess({ list: [], total: 0 })),
 * });
 */
export function mockApiModule(
  modulePath: string,
  overrides: Record<string, ReturnType<typeof vi.fn>> = {},
): void {
  vi.mock(modulePath, () => {
    return new Proxy(overrides, {
      get(target, prop: string) {
        if (prop in target) return target[prop];
        // 未指定的导出函数默认返回空的 vi.fn()
        return vi.fn();
      },
    });
  });
}

/**
 * 创建带分页的 mock API 响应数据
 * @param list 列表数据
 * @param total 总数（默认等于 list.length）
 */
export function mockPaginatedData<T>(list: T[], total?: number): { list: T[]; total: number; page: number; pageSize: number } {
  return {
    list,
    total: total ?? list.length,
    page: 1,
    pageSize: 10,
  };
}
