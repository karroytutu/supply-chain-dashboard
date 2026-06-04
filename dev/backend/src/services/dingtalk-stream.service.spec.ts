/**
 * 钉钉 Stream 事件总线服务单元测试
 * 注意：dingtalk-stream.service 使用单例模式，每个 describe 块只启动一次
 */

jest.mock('../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

jest.mock('../config', () => ({
  config: { dingtalk: { appKey: 'test_key', appSecret: 'test_secret' } },
}));

jest.mock('../utils/errorUtils', () => ({
  getErrorMessage: (err: any) => (err instanceof Error ? err.message : String(err)),
}));

let capturedEventHandler: any = null;

jest.mock('dingtalk-stream-sdk-nodejs', () => ({
  DWClient: jest.fn().mockImplementation(() => ({
    registerAllEventListener: jest.fn((cb: any) => {
      capturedEventHandler = cb;
    }),
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  })),
  EventAck: { SUCCESS: 'SUCCESS', LATER: 'LATER' },
}));

import { DWClient, EventAck } from 'dingtalk-stream-sdk-nodejs';
import { dingtalkEvents, startDingtalkStream, stopDingtalkStream } from './dingtalk-stream.service';

describe('dingtalk-stream.service', () => {
  beforeAll(() => {
    // 只启动一次（单例模式）
    startDingtalkStream();
  });

  afterAll(() => {
    stopDingtalkStream();
  });

  describe('startDingtalkStream', () => {
    it('创建 DWClient 并使用正确的凭据', () => {
      expect(DWClient).toHaveBeenCalledWith({
        clientId: 'test_key',
        clientSecret: 'test_secret',
      });
    });

    it('重复调用不会创建第二个客户端', () => {
      const mockDwClient = DWClient as unknown as jest.Mock;
      const callCount = mockDwClient.mock.calls.length;
      startDingtalkStream(); // 重复调用
      expect(mockDwClient.mock.calls.length).toBe(callCount);
    });
  });

  describe('事件分发', () => {
    it('事件处理器正确分发事件到 dingtalkEvents', () => {
      expect(capturedEventHandler).not.toBeNull();

      const handler = jest.fn();
      dingtalkEvents.on('test_event_spec', handler);

      capturedEventHandler({
        headers: { topic: 'test_event_spec', eventId: 'evt_001' },
        data: JSON.stringify({ userId: '123' }),
      });

      expect(handler).toHaveBeenCalledWith(
        { userId: '123' },
        { topic: 'test_event_spec', eventId: 'evt_001' }
      );

      dingtalkEvents.removeAllListeners('test_event_spec');
    });

    it('正常事件返回 SUCCESS 状态', () => {
      const result = capturedEventHandler({
        headers: { topic: 'good_event', eventId: 'evt_003' },
        data: '{}',
      });

      expect(result.status).toBe(EventAck.SUCCESS);
    });

    it('事件 JSON 解析失败时返回 LATER 状态', () => {
      const result = capturedEventHandler({
        headers: { topic: 'bad_event', eventId: 'evt_002' },
        data: 'invalid json{{{',
      });

      expect(result.status).toBe(EventAck.LATER);
    });
  });

  describe('stopDingtalkStream', () => {
    it('调用后不抛异常', () => {
      expect(() => stopDingtalkStream()).not.toThrow();
    });
  });
});
