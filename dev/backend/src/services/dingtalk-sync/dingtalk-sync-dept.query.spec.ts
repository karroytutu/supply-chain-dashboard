/**
 * 钉钉部门查询模块测试
 */

// Mock 必须在 import 之前声明
jest.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock('../../utils/errorUtils', () => ({
  getErrorMessage: (e: any) => (e instanceof Error ? e.message : String(e)),
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../dingtalk.service', () => ({
  getAccessToken: jest.fn(),
  RETRYABLE_ERROR_CODES: [88001],
}));

// Mock https 模块
jest.mock('https');

import { EventEmitter } from 'events';
import * as https from 'https';
import { appQuery } from '../../db/appPool';
import { getAccessToken } from '../dingtalk.service';
import {
  fetchDingtalkDeptTree,
  fetchDingtalkDeptDetail,
  getAllLocalDepts,
  getDeptByDingtalkId,
} from './dingtalk-sync-dept.query';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockGetAccessToken = getAccessToken as jest.MockedFunction<typeof getAccessToken>;

/**
 * 辅助函数：模拟 https.request 的响应
 */
function mockHttpResponse(statusCode: number, body: object | string) {
  const response = new EventEmitter() as any;
  response.statusCode = statusCode;

  const req = new EventEmitter() as any;
  req.write = jest.fn();
  req.end = jest.fn();
  req.setTimeout = jest.fn();
  req.destroy = jest.fn();

  (https.request as jest.Mock).mockImplementation((_options: any, callback: any) => {
    callback(response);
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    // 异步触发 data/end 事件
    process.nextTick(() => {
      response.emit('data', bodyStr);
      response.emit('end');
    });
    return req;
  });

  return req;
}

describe('dingtalk-sync-dept.query', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAccessToken.mockResolvedValue('mock-token');
  });

  describe('fetchDingtalkDeptTree', () => {
    it('should return empty array when API returns empty result', async () => {
      mockHttpResponse(200, { errcode: 0, result: [] });

      const result = await fetchDingtalkDeptTree(1);
      expect(result).toEqual([]);
    });

    it('should fetch single-level departments', async () => {
      // 第一次调用: 获取根部门子级
      let callCount = 0;
      const req = new EventEmitter() as any;
      req.write = jest.fn();
      req.end = jest.fn();
      req.setTimeout = jest.fn();
      req.destroy = jest.fn();

      (https.request as jest.Mock).mockImplementation((_options: any, callback: any) => {
        callCount++;
        const response = new EventEmitter() as any;
        response.statusCode = 200;
        callback(response);

        if (callCount === 1) {
          // 根部门有1个子部门
          process.nextTick(() => {
            response.emit('data', JSON.stringify({
              errcode: 0,
              result: [{ dept_id: 100, name: '技术部', parent_id: 1, auto_add_user: true }],
            }));
            response.emit('end');
          });
        } else {
          // 子部门没有子部门
          process.nextTick(() => {
            response.emit('data', JSON.stringify({ errcode: 0, result: [] }));
            response.emit('end');
          });
        }
        return req;
      });

      const result = await fetchDingtalkDeptTree(1);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        dept_id: 100,
        name: '技术部',
        parent_id: 1,
        auto_add_user: true,
      });
    });

    it('should recursively fetch nested departments', async () => {
      let callCount = 0;
      const responses = [
        // 根: 返回1个子部门
        { errcode: 0, result: [{ dept_id: 10, name: '部门A', parent_id: 1, auto_add_user: false }] },
        // 部门10: 返回1个子部门
        { errcode: 0, result: [{ dept_id: 20, name: '部门B', parent_id: 10, auto_add_user: true }] },
        // 部门20: 无子部门
        { errcode: 0, result: [] },
      ];

      (https.request as jest.Mock).mockImplementation((_options: any, callback: any) => {
        const response = new EventEmitter() as any;
        response.statusCode = 200;
        callback(response);

        const respData = responses[callCount] || { errcode: 0, result: [] };
        callCount++;

        process.nextTick(() => {
          response.emit('data', JSON.stringify(respData));
          response.emit('end');
        });

        const req = new EventEmitter() as any;
        req.write = jest.fn();
        req.end = jest.fn();
        req.setTimeout = jest.fn();
        req.destroy = jest.fn();
        return req;
      });

      const result = await fetchDingtalkDeptTree(1);
      expect(result).toHaveLength(2);
      expect(result[0].dept_id).toBe(10);
      expect(result[1].dept_id).toBe(20);
      expect(result[1].parent_id).toBe(10);
    });

    it('should handle API error gracefully and return empty array', async () => {
      (https.request as jest.Mock).mockImplementation((_options: any, _callback: any) => {
        const req = new EventEmitter() as any;
        req.write = jest.fn();
        req.end = jest.fn();
        req.setTimeout = jest.fn();
        req.destroy = jest.fn();
        // 触发 error 事件
        process.nextTick(() => {
          req.emit('error', new Error('Network error'));
        });
        return req;
      });

      const result = await fetchDingtalkDeptTree(1);
      // 所有重试都失败后，catch 捕获并返回空数组
      expect(result).toEqual([]);
    }, 30000);

    it('should handle non-zero errcode gracefully', async () => {
      mockHttpResponse(200, { errcode: 40001, errmsg: 'invalid token', result: null });

      // 对于非0 errcode且非限流码的情况, rateLimitedRequest 会直接返回 result
      // fetchDingtalkDeptTree 判断 errcode !== 0 不进入 if 分支
      const result = await fetchDingtalkDeptTree(1);
      expect(result).toEqual([]);
    });
  });

  describe('fetchDingtalkDeptDetail', () => {
    it('should return department detail on success', async () => {
      mockHttpResponse(200, {
        errcode: 0,
        result: { dept_id: 100, name: '技术部', parent_id: 1, auto_add_user: true },
      });

      const result = await fetchDingtalkDeptDetail(100);
      expect(result).toEqual({
        dept_id: 100,
        name: '技术部',
        parent_id: 1,
        auto_add_user: true,
      });
    });

    it('should return null when errcode is non-zero', async () => {
      mockHttpResponse(200, { errcode: 60003, errmsg: 'dept not found', result: null });

      const result = await fetchDingtalkDeptDetail(999);
      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      (https.request as jest.Mock).mockImplementation((_options: any, _callback: any) => {
        const req = new EventEmitter() as any;
        req.write = jest.fn();
        req.end = jest.fn();
        req.setTimeout = jest.fn();
        req.destroy = jest.fn();
        process.nextTick(() => {
          req.emit('error', new Error('Connection refused'));
        });
        return req;
      });

      const result = await fetchDingtalkDeptDetail(100);
      expect(result).toBeNull();
    }, 30000);
  });

  describe('getAllLocalDepts', () => {
    it('should return a map of dingtalk_dept_id to dept info', async () => {
      mockAppQuery.mockResolvedValue({
        rows: [
          { id: 1, dingtalk_dept_id: '100', name: '技术部', parent_id: '1' },
          { id: 2, dingtalk_dept_id: '200', name: '市场部', parent_id: null },
        ],
        rowCount: 2,
      } as any);

      const result = await getAllLocalDepts();
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(2);
      expect(result.get('100')).toEqual({ id: 1, name: '技术部', parent_id: '1' });
      expect(result.get('200')).toEqual({ id: 2, name: '市场部', parent_id: null });
    });

    it('should return empty map when no departments exist', async () => {
      mockAppQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await getAllLocalDepts();
      expect(result.size).toBe(0);
    });

    it('should call appQuery with correct SQL', async () => {
      mockAppQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await getAllLocalDepts();
      expect(mockAppQuery).toHaveBeenCalledWith(
        'SELECT id, dingtalk_dept_id, name, parent_id FROM dingtalk_departments'
      );
    });
  });

  describe('getDeptByDingtalkId', () => {
    it('should return department when found', async () => {
      mockAppQuery.mockResolvedValue({
        rows: [{ id: 1, name: '技术部' }],
        rowCount: 1,
      } as any);

      const result = await getDeptByDingtalkId('100');
      expect(result).toEqual({ id: 1, name: '技术部' });
      expect(mockAppQuery).toHaveBeenCalledWith(
        'SELECT id, name FROM dingtalk_departments WHERE dingtalk_dept_id = $1',
        ['100']
      );
    });

    it('should return null when department not found', async () => {
      mockAppQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await getDeptByDingtalkId('999');
      expect(result).toBeNull();
    });
  });
});
