/**
 * 催收升级与退回操作单元测试
 */

jest.mock('../../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../../db/appPool', () => ({
  getAppClient: jest.fn(),
}));

jest.mock('../../../utils/constants', () => ({
  AR_ESCALATION_HANDLER_ROLES: { 1: 'marketing_supervisor', 2: 'manager' },
  AR_ROLLBACK_HANDLER_ROLES: { 0: 'cashier', 1: 'finance_staff' },
}));

jest.mock('../ar-collection.repository', () => ({
  invalidateTaskCache: jest.fn(),
  invalidateStatsCache: jest.fn(),
}));

jest.mock('../ar-collection-notify', () => ({
  sendCollectionNotification: jest.fn().mockResolvedValue(undefined),
  sendCollectionNotificationByRole: jest.fn().mockResolvedValue(undefined),
  buildEscalationActionCard: jest.fn().mockReturnValue({}),
  buildRollbackActionCard: jest.fn().mockReturnValue({}),
  ESCALATION_LEVEL_NAMES: { 1: '一级升级', 2: '二级升级' },
}));

jest.mock('./shared-utils', () => ({
  logAction: jest.fn().mockResolvedValue(undefined),
  mapTaskStatusToDetailStatus: jest.fn().mockReturnValue('resolved'),
}));

import { getAppClient } from '../../../db/appPool';
import { escalateTask } from './escalate-operations';

const mockGetClient = getAppClient as jest.MockedFunction<typeof getAppClient>;

function createMockClient(queryResponses: any[][]) {
  let callIndex = 0;
  return {
    query: jest.fn().mockImplementation(() => {
      const response = queryResponses[callIndex] || [];
      callIndex++;
      return Promise.resolve({ rows: response, rowCount: response.length });
    }),
    release: jest.fn(),
  };
}

beforeEach(() => {
  jest.resetAllMocks();
});

describe('escalateTask', () => {
  it('任务不存在时抛出异常', async () => {
    const client = createMockClient([
      [], // BEGIN
      [], // SELECT task (empty = not found)
    ]);
    mockGetClient.mockResolvedValueOnce(client as any);

    await expect(
      escalateTask(999, { detail_ids: [], reason: '测试', operator_id: 1, operator_name: 'A' } as any, { id: 1 } as any)
    ).rejects.toThrow('催收任务不存在');
  });

  it('已达最高级别时抛出异常', async () => {
    const task = { id: 1, status: 'collecting', escalation_level: 2 };
    const client = createMockClient([
      [],       // BEGIN
      [task],   // SELECT task
    ]);
    mockGetClient.mockResolvedValueOnce(client as any);

    await expect(
      escalateTask(1, { detail_ids: [], reason: '升级', operator_id: 1, operator_name: 'A' } as any, { id: 1 } as any)
    ).rejects.toThrow('已达到最高升级级别');
  });

  it('成功升级任务', async () => {
    const task = { id: 1, status: 'collecting', escalation_level: 0 };
    const client = createMockClient([
      [],       // BEGIN
      [task],   // SELECT task
      [],       // UPDATE task
      [],       // UPDATE details (if any)
      [],       // log action insert
      [],       // COMMIT
    ]);
    mockGetClient.mockResolvedValueOnce(client as any);

    await escalateTask(
      1,
      { detail_ids: [], reason: '需要升级处理', operator_id: 5, operator_name: '张三' } as any,
      { id: 5, name: '张三' } as any
    );

    // 验证 UPDATE 被调用
    expect(client.query).toHaveBeenCalled();
    const updateCall = client.query.mock.calls.find(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('UPDATE ar_collection_tasks')
    );
    expect(updateCall).toBeDefined();
  });

  it('指定 target_level 有效时升级', async () => {
    const task = { id: 1, status: 'collecting', escalation_level: 0 };
    const client = createMockClient([
      [],       // BEGIN
      [task],   // SELECT task
      [],       // UPDATE task
      [],       // COMMIT
    ]);
    mockGetClient.mockResolvedValueOnce(client as any);

    await escalateTask(
      1,
      { detail_ids: [], reason: '直接升级到二级', target_level: 2, operator_id: 5, operator_name: '张三' } as any,
      { id: 5 } as any
    );

    expect(client.query).toHaveBeenCalled();
  });

  it('target_level 无效时抛出异常', async () => {
    const task = { id: 1, status: 'collecting', escalation_level: 1 };
    const client = createMockClient([
      [],       // BEGIN
      [task],   // SELECT task
    ]);
    mockGetClient.mockResolvedValueOnce(client as any);

    await expect(
      escalateTask(
        1,
        { detail_ids: [], reason: '无效', target_level: 0, operator_id: 5, operator_name: 'A' } as any,
        { id: 5 } as any
      )
    ).rejects.toThrow('无效的升级目标级别');
  });
});
