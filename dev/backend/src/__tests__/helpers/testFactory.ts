/**
 * Express Mock 工厂工具
 * 提供统一的 Request / Response / Next mock 构建方法
 * 用于测试控制器和中间件
 *
 * @example
 * import { createMockRequest, createMockResponse, createMockNext } from '../__tests__/helpers/testFactory';
 *
 * const req = createMockRequest({ user: { id: 1, roles: ['admin'] } });
 * const res = createMockResponse();
 * const next = createMockNext();
 *
 * await controller.list(req, res, next);
 * expect(res.status).toHaveBeenCalledWith(200);
 */

import type { Request, Response, NextFunction } from 'express';

interface MockRequestOverrides {
  user?: Record<string, unknown>;
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

/**
 * 创建模拟的 Express Request 对象
 * @param overrides 覆盖默认值（user / params / query / body / headers）
 */
export function createMockRequest(overrides: MockRequestOverrides = {}): Request {
  return {
    user: overrides.user ?? { id: 1, username: 'testuser', roles: ['admin'], permissions: [] },
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    body: overrides.body ?? {},
    headers: overrides.headers ?? { authorization: 'Bearer mock-token' },
    get: jest.fn((header: string) => overrides.headers?.[header.toLowerCase()] ?? ''),
    header: jest.fn((header: string) => overrides.headers?.[header.toLowerCase()] ?? ''),
  } as unknown as Request;
}

/**
 * 创建模拟的 Express Response 对象
 * 所有方法均为 jest.fn()，支持链式调用（res.status(200).json({...})）
 */
export function createMockResponse(): Response & {
  status: jest.Mock;
  json: jest.Mock;
  send: jest.Mock;
  sendStatus: jest.Mock;
  setHeader: jest.Mock;
} {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
    send: jest.fn(),
    sendStatus: jest.fn(),
    setHeader: jest.fn(),
  };
  // 支持链式调用：res.status(200).json({...})
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.send.mockReturnValue(res);

  return res as unknown as Response & {
    status: jest.Mock;
    json: jest.Mock;
    send: jest.Mock;
    sendStatus: jest.Mock;
    setHeader: jest.Mock;
  };
}

/**
 * 创建模拟的 Express next 函数
 * @param impl 可选：自定义实现（如抛出错误）
 */
export function createMockNext(impl?: () => void): NextFunction {
  return jest.fn(impl) as unknown as NextFunction;
}

/**
 * 快捷方法：创建带有指定角色的 Request
 * @param roles 角色编码数组
 * @param userId 用户 ID（默认 1）
 */
export function createRequestWithRoles(roles: string[], userId = 1): Request {
  return createMockRequest({
    user: { id: userId, username: 'testuser', roles, permissions: [] },
  });
}

/**
 * 快捷方法：创建带有指定权限的 Request
 * @param permissions 权限编码数组
 * @param roles 角色编码数组（默认 ['operator']）
 */
export function createRequestWithPermissions(
  permissions: string[],
  roles: string[] = ['operator'],
): Request {
  return createMockRequest({
    user: { id: 1, username: 'testuser', roles, permissions },
  });
}
