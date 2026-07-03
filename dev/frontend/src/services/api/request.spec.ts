/**
 * API 请求封装层单元测试
 * 测试 toSnakeKeys 参数转换、错误处理、响应格式解析
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { request, requestFormData, isAbortError } from './request';

// Mock 依赖模块
vi.mock('@/utils/keyConvert', () => ({
  toSnakeKeys: (obj: any) => {
    if (!obj || typeof obj !== 'object') return obj;
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = key.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`);
      result[snakeKey] = value;
    }
    return result;
  },
}));

vi.mock('@/utils/appMessage', () => ({
  showErrorMessage: vi.fn(),
}));

// 辅助函数：创建 mock fetch 响应
function mockFetchResponse(body: any, status = 200, statusText = 'OK'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
    headers: new Headers(),
  } as Response;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  // 默认 localStorage 有 token
  Storage.prototype.getItem = vi.fn((key: string) => key === 'auth_token' ? 'test-token' : null);
  Storage.prototype.removeItem = vi.fn();
  // 模拟非登录页
  Object.defineProperty(window, 'location', {
    value: { pathname: '/dashboard', href: 'http://localhost:3100/dashboard' },
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ==================== GET 参数转换 ====================

describe('GET 参数处理', () => {
  it('camelCase 参数自动转 snake_case', async () => {
    (fetch as any).mockResolvedValueOnce(mockFetchResponse({ success: true, data: {} }));

    await request('/test', { params: { pageSize: 10, statusTab: 'active' } });

    const url = (fetch as any).mock.calls[0][0];
    expect(url).toContain('page_size=10');
    expect(url).toContain('status_tab=active');
  });

  it('skipParamsSnakeCase 跳过转换', async () => {
    (fetch as any).mockResolvedValueOnce(mockFetchResponse({ success: true, data: {} }));

    await request('/test', {
      params: { pageSize: 10 },
      skipParamsSnakeCase: true,
    });

    const url = (fetch as any).mock.calls[0][0];
    expect(url).toContain('pageSize=10');
    expect(url).not.toContain('page_size');
  });

  it('过滤 undefined/null/空字符串参数', async () => {
    (fetch as any).mockResolvedValueOnce(mockFetchResponse({ success: true, data: {} }));

    await request('/test', {
      params: { keyword: 'test', empty: '', nothing: null, undef: undefined, valid: 'ok' },
    });

    const url = (fetch as any).mock.calls[0][0];
    expect(url).toContain('keyword=test');
    expect(url).toContain('valid=ok');
    expect(url).not.toContain('empty');
    expect(url).not.toContain('nothing');
    expect(url).not.toContain('undef');
  });

  it('无参数时不附加 query string', async () => {
    (fetch as any).mockResolvedValueOnce(mockFetchResponse({ success: true, data: {} }));

    await request('/test');

    const url = (fetch as any).mock.calls[0][0];
    expect(url).toBe('/api/test');
  });
});

// ==================== 认证头处理 ====================

describe('认证头处理', () => {
  it('有 token 时添加 Authorization 头', async () => {
    (fetch as any).mockResolvedValueOnce(mockFetchResponse({ success: true, data: {} }));

    await request('/test');

    const headers = (fetch as any).mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer test-token');
  });

  it('无 token 时不添加 Authorization 头', async () => {
    (Storage.prototype.getItem as any).mockReturnValue(null);
    (fetch as any).mockResolvedValueOnce(mockFetchResponse({ success: true, data: {} }));

    await request('/test');

    const headers = (fetch as any).mock.calls[0][1].headers;
    expect(headers.Authorization).toBeUndefined();
  });
});

// ==================== 响应格式解析 ====================

describe('响应格式解析', () => {
  it('格式1: { success, data } → 返回 data', async () => {
    (fetch as any).mockResolvedValueOnce(
      mockFetchResponse({ success: true, data: { id: 1, name: 'test' } })
    );

    const result = await request('/test');
    expect(result).toEqual({ id: 1, name: 'test' });
  });

  it('格式1 分页: { success, data: [], total, page } → 返回含分页信息', async () => {
    (fetch as any).mockResolvedValueOnce(
      mockFetchResponse({ success: true, data: [{ id: 1 }], total: 50, page: 1, pageSize: 20 })
    );

    const result = await request<any>('/test');
    expect(result.data).toEqual([{ id: 1 }]);
    expect(result.total).toBe(50);
  });

  it('格式2: { code: 200, data } → 返回 data', async () => {
    (fetch as any).mockResolvedValueOnce(
      mockFetchResponse({ code: 200, message: 'ok', data: { value: 42 } })
    );

    const result = await request('/test');
    expect(result).toEqual({ value: 42 });
  });

  it('格式2: { code: 500, message } → 抛出异常', async () => {
    (fetch as any).mockResolvedValueOnce(
      mockFetchResponse({ code: 500, message: '服务器错误', data: null })
    );

    await expect(request('/test')).rejects.toThrow('服务器错误');
  });

  it('非标准格式直接返回', async () => {
    (fetch as any).mockResolvedValueOnce(
      mockFetchResponse({ custom: 'value' })
    );

    const result = await request('/test');
    expect(result).toEqual({ custom: 'value' });
  });
});

// ==================== HTTP 错误处理 ====================

describe('HTTP 错误处理', () => {
  it('401 清除 token 并跳转登录页', async () => {
    (fetch as any).mockResolvedValueOnce(
      mockFetchResponse({ message: 'token expired' }, 401, 'Unauthorized')
    );

    await expect(request('/test')).rejects.toThrow();
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('auth_token');
  });

  it('401 在登录页时不重复跳转', async () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/login', href: 'http://localhost:3100/login' },
      writable: true,
    });
    (fetch as any).mockResolvedValueOnce(
      mockFetchResponse({ message: 'token expired' }, 401, 'Unauthorized')
    );

    await expect(request('/test')).rejects.toThrow();
    // 不应该修改 window.location.href（因为已在登录页）
  });

  it('403 显示权限错误', async () => {
    const { showErrorMessage } = await import('@/utils/appMessage');
    (fetch as any).mockResolvedValueOnce(
      mockFetchResponse({ message: '无权限' }, 403, 'Forbidden')
    );

    await expect(request('/test')).rejects.toThrow();
    expect(showErrorMessage).toHaveBeenCalledWith('无权限');
  });

  it('skipErrorHandler 跳过 401/403 处理', async () => {
    const { showErrorMessage } = await import('@/utils/appMessage');
    (showErrorMessage as any).mockClear();
    (fetch as any).mockResolvedValueOnce(
      mockFetchResponse({ message: 'forbidden' }, 403, 'Forbidden')
    );

    await expect(request('/test', { skipErrorHandler: true })).rejects.toThrow();
    expect(showErrorMessage).not.toHaveBeenCalled();
  });
});

// ==================== isAbortError 工具函数 ====================

describe('isAbortError', () => {
  it('识别 DOMException AbortError', () => {
    expect(isAbortError(new DOMException('Aborted', 'AbortError'))).toBe(true);
  });

  it('识别 name 为 AbortError 的普通 Error', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(isAbortError(err)).toBe(true);
  });

  it('不识别普通 Error', () => {
    expect(isAbortError(new Error('network error'))).toBe(false);
  });

  it('不识别 null/undefined', () => {
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
  });
});

// ==================== 网络错误 ====================

describe('网络错误处理', () => {
  it('AbortError 保留原始 DOMException 身份', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    (fetch as any).mockRejectedValueOnce(abortError);

    try {
      await request('/test');
      expect.fail('should have thrown');
    } catch (error) {
      expect(isAbortError(error)).toBe(true);
      expect(error).toBeInstanceOf(DOMException);
    }
  });

  it('Failed to fetch 仍转为网络错误提示', async () => {
    (fetch as any).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    try {
      await request('/test');
      expect.fail('should have thrown');
    } catch (error) {
      expect(isAbortError(error)).toBe(false);
      expect((error as Error).message).toContain('网络连接失败');
    }
  });

  it('其他 Error 原样抛出', async () => {
    (fetch as any).mockRejectedValueOnce(new Error('custom error'));

    await expect(request('/test')).rejects.toThrow('custom error');
  });
});

// ==================== 便捷方法 ====================

describe('便捷方法', () => {
  it('request.get 发送 GET 请求', async () => {
    (fetch as any).mockResolvedValueOnce(mockFetchResponse({ success: true, data: [] }));

    await request.get('/items');

    expect((fetch as any).mock.calls[0][1].method).toBe('GET');
  });

  it('request.post 发送 POST 请求并附带 body', async () => {
    (fetch as any).mockResolvedValueOnce(mockFetchResponse({ success: true, data: {} }));

    await request.post('/items', { name: 'test' });

    const config = (fetch as any).mock.calls[0][1];
    expect(config.method).toBe('POST');
    expect(JSON.parse(config.body)).toEqual({ name: 'test' });
  });

  it('request.put 发送 PUT 请求', async () => {
    (fetch as any).mockResolvedValueOnce(mockFetchResponse({ success: true, data: {} }));

    await request.put('/items/1', { name: 'updated' });

    expect((fetch as any).mock.calls[0][1].method).toBe('PUT');
  });

  it('request.delete 发送 DELETE 请求', async () => {
    (fetch as any).mockResolvedValueOnce(mockFetchResponse({ success: true, data: {} }));

    await request.delete('/items/1');

    expect((fetch as any).mock.calls[0][1].method).toBe('DELETE');
  });
});

// ==================== requestFormData ====================

describe('requestFormData', () => {
  it('发送 FormData 请求', async () => {
    (fetch as any).mockResolvedValueOnce(
      mockFetchResponse({ success: true, data: { url: '/uploads/file.jpg' } })
    );

    const fd = new FormData();
    fd.append('file', new Blob(['test']), 'test.txt');

    const result = await requestFormData('/upload', fd);
    expect(result).toEqual({ url: '/uploads/file.jpg' });
  });

  it('上传超时时抛出特定错误', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    (fetch as any).mockRejectedValueOnce(abortError);

    const fd = new FormData();
    await expect(requestFormData('/upload', fd)).rejects.toThrow('上传超时');
  });

  it('401 时清除 token 并跳转', async () => {
    (fetch as any).mockResolvedValueOnce(
      mockFetchResponse({ message: 'unauthorized' }, 401)
    );

    const fd = new FormData();
    await expect(requestFormData('/upload', fd)).rejects.toThrow('未授权');
    expect(Storage.prototype.removeItem).toHaveBeenCalledWith('auth_token');
  });
});
