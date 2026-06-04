/**
 * 钉钉消息发送服务单元测试
 */

jest.mock('../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}));

jest.mock('../config', () => ({
  config: { dingtalk: { agentId: 12345 } },
}));

jest.mock('./dingtalk-client', () => ({
  getAccessToken: jest.fn(),
  sendDingtalkRequest: jest.fn(),
}));

jest.mock('./notification-log.service', () => ({
  createNotificationLog: jest.fn(),
  updateNotificationLogStatus: jest.fn(),
}));

jest.mock('../utils/errorUtils', () => ({
  getErrorMessage: (err: any) => (err instanceof Error ? err.message : String(err)),
}));

import { getAccessToken, sendDingtalkRequest } from './dingtalk-client';
import { createNotificationLog, updateNotificationLogStatus } from './notification-log.service';
import { sendWorkNotification } from './dingtalk-message.service';

const mockGetAccessToken = getAccessToken as jest.MockedFunction<typeof getAccessToken>;
const mockSendRequest = sendDingtalkRequest as jest.MockedFunction<typeof sendDingtalkRequest>;
const mockCreateLog = createNotificationLog as jest.MockedFunction<typeof createNotificationLog>;
const mockUpdateLog = updateNotificationLogStatus as jest.MockedFunction<typeof updateNotificationLogStatus>;

describe('dingtalk-message.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAccessToken.mockResolvedValue('mock_access_token');
    mockCreateLog.mockResolvedValue(1);
  });

  describe('sendWorkNotification', () => {
    it('接收者列表为空时返回失败', async () => {
      const result = await sendWorkNotification([], '标题', '内容');

      expect(result.success).toBe(false);
      expect(result.message).toContain('接收者');
    });

    it('发送 markdown 消息成功', async () => {
      mockSendRequest.mockResolvedValueOnce({ errcode: 0, errmsg: 'ok', taskId: 999 });

      const result = await sendWorkNotification(
        ['user1', 'user2'],
        '测试标题',
        '### 测试内容'
      );

      expect(result.success).toBe(true);
      expect(mockSendRequest).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          msg: expect.objectContaining({ msgtype: 'markdown' }),
        })
      );
    });

    it('发送 actionCard 消息', async () => {
      mockSendRequest.mockResolvedValueOnce({ errcode: 0, errmsg: 'ok', taskId: 999 });

      const result = await sendWorkNotification(
        ['user1'],
        '审批通知',
        '请审批',
        {
          msgType: 'actionCard',
          actionCard: {
            title: '审批通知',
            markdown: '请审批此单据',
            singleTitle: '查看详情',
            singleUrl: 'https://example.com/detail/1',
          },
        }
      );

      expect(result.success).toBe(true);
    });

    it('actionCard 内容为空时返回失败', async () => {
      const result = await sendWorkNotification(
        ['user1'],
        '标题',
        '内容',
        { msgType: 'actionCard' }
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('ActionCard');
    });

    it('OA 消息内容为空时返回失败', async () => {
      const result = await sendWorkNotification(
        ['user1'],
        '标题',
        '内容',
        { msgType: 'oa' }
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('OA');
    });

    it('API 调用失败时返回失败', async () => {
      mockSendRequest.mockRejectedValueOnce(new Error('Network error'));

      const result = await sendWorkNotification(
        ['user1'],
        '标题',
        '内容'
      );

      expect(result.success).toBe(false);
    });
  });
});
