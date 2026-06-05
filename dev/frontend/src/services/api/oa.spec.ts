/**
 * OA API 服务层测试 - updateInstance
 * @module services/api/oa.spec
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock request 模块
const mockRequest = vi.fn();
vi.mock('./request', () => ({
  default: (...args: unknown[]) => mockRequest(...args),
  requestFormData: vi.fn(),
}));

import { updateInstance } from './oa';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('updateInstance', () => {
  it('发送 POST 请求到正确路径', async () => {
    mockRequest.mockResolvedValueOnce({ success: true, message: '数据已更新' });

    await updateInstance(42, { formData: { field1: 'v1' } });

    expect(mockRequest).toHaveBeenCalledOnce();
    const [url, options] = mockRequest.mock.calls[0];
    expect(url).toBe('/oa/instances/42/update');
    expect(options.method).toBe('POST');
  });

  it('body 包含 formData 和 comment', async () => {
    mockRequest.mockResolvedValueOnce({ success: true, message: 'ok' });

    await updateInstance(10, { formData: { x: 1 }, comment: '备注内容' });

    const [, options] = mockRequest.mock.calls[0];
    expect(options.body).toEqual({ formData: { x: 1 }, comment: '备注内容' });
  });

  it('不传 comment 时 body 中无 comment', async () => {
    mockRequest.mockResolvedValueOnce({ success: true, message: 'ok' });

    await updateInstance(5, { formData: { a: 'b' } });

    const [, options] = mockRequest.mock.calls[0];
    expect(options.body).toEqual({ formData: { a: 'b' } });
    expect(options.body.comment).toBeUndefined();
  });

  it('request 抛出异常时向上传播', async () => {
    mockRequest.mockRejectedValueOnce(new Error('网络错误'));

    await expect(updateInstance(1, { formData: {} })).rejects.toThrow('网络错误');
  });
});
