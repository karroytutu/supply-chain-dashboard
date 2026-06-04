/**
 * 压单检测服务单元测试
 * 测试: detectAllHoardChanges, detectHoardChangesByCustomer
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));
jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
  getAppClient: jest.fn(),
}));
jest.mock('./ar-debt-enrichment.service', () => ({
  fetchCustomerData: jest.fn(),
  fetchHoardTags: jest.fn(),
}));

import { detectAllHoardChanges, detectHoardChangesByCustomer } from './ar-hoard-detect';
import { appQuery, getAppClient } from '../../db/appPool';
import { fetchCustomerData, fetchHoardTags } from './ar-debt-enrichment.service';
import {
  AR_HOARD_TAG_HOARD,
  AR_DETAIL_STATUS_HOARD_EXCLUDED,
  AR_HOLD_TYPE_LONG_TERM,
  AR_HOLD_TYPE_TIME_LIMITED,
} from '../../utils/constants';

const mockAppQuery = appQuery as jest.Mock;
const mockGetAppClient = getAppClient as jest.Mock;
const mockFetchCustomerData = fetchCustomerData as jest.Mock;
const mockFetchHoardTags = fetchHoardTags as jest.Mock;

function createMockClient() {
  return {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================
// detectAllHoardChanges
// ============================================

describe('detectAllHoardChanges', () => {
  it('无活跃明细时直接返回', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [] });

    await detectAllHoardChanges();

    expect(mockFetchCustomerData).not.toHaveBeenCalled();
  });

  it('无压单变更时直接返回', async () => {
    // fetchDetectableDetails 返回2条明细
    mockAppQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, task_id: 1, erp_bill_id: 'B1', left_amount: 100, status: 'pending', hoard_tag: null, consumer_name: '客户A', task_status: 'collecting' },
        { id: 2, task_id: 1, erp_bill_id: 'B2', left_amount: 200, status: 'pending', hoard_tag: null, consumer_name: '客户A', task_status: 'collecting' },
      ],
    });

    mockFetchCustomerData.mockResolvedValue({ nameToTraderId: new Map([['客户A', 100]]) });
    // fetchHoardTags 返回 NORMAL 标记（无变更）
    mockFetchHoardTags.mockResolvedValue(new Map([['B1', 'NORMAL'], ['B2', 'NORMAL']]));

    await detectAllHoardChanges();

    // 不应进入 processHoardChanges
    expect(mockGetAppClient).not.toHaveBeenCalled();
  });

  it('检测到压单变更: 排除明细 + 重算任务', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, task_id: 1, erp_bill_id: 'B1', left_amount: 100, status: 'pending', hoard_tag: null, consumer_name: '客户A', task_status: 'collecting' },
      ],
    });

    mockFetchCustomerData.mockResolvedValue({ nameToTraderId: new Map([['客户A', 100]]) });
    // B1 变为 HOARD
    mockFetchHoardTags.mockResolvedValue(new Map([['B1', AR_HOARD_TAG_HOARD]]));

    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve({ rows: [] });
      if (sql.includes('COALESCE(SUM')) {
        return Promise.resolve({ rows: [{ total: '0', cnt: '0' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await detectAllHoardChanges();

    expect(client.query).toHaveBeenCalledWith('BEGIN');
    // pending 明细应被排除
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = $1, hoard_tag = $2"),
      expect.arrayContaining([AR_DETAIL_STATUS_HOARD_EXCLUDED, AR_HOARD_TAG_HOARD])
    );
    // 任务应被重算
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('SET total_amount = $1, bill_count = $2'),
      [0, 0, 1]
    );
    // 所有明细排除后任务应被关闭
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'closed'"),
      [1]
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('处理中明细仅更新hoard_tag不改变状态', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, task_id: 1, erp_bill_id: 'B1', left_amount: 100, status: 'pending_verify', hoard_tag: null, consumer_name: '客户A', task_status: 'collecting' },
      ],
    });

    mockFetchCustomerData.mockResolvedValue({ nameToTraderId: new Map([['客户A', 100]]) });
    mockFetchHoardTags.mockResolvedValue(new Map([['B1', AR_HOARD_TAG_HOARD]]));

    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve({ rows: [] });
      if (sql.includes('COALESCE(SUM')) {
        return Promise.resolve({ rows: [{ total: '100', cnt: '1' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await detectAllHoardChanges();

    // 非pending明细仅更新hoard_tag
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("SET hoard_tag = $1"),
      expect.any(Array)
    );
    // 不应关闭(cnt=1)
    const closeCalls = client.query.mock.calls.filter(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes("SET status = 'closed'")
    );
    expect(closeCalls).toHaveLength(0);
  });

  it('异常时不抛出(兜底机制)', async () => {
    mockAppQuery.mockRejectedValue(new Error('DB failure'));

    // 不应抛出
    await detectAllHoardChanges();
  });
});

// ============================================
// detectHoardChangesByCustomer
// ============================================

describe('detectHoardChangesByCustomer', () => {
  it('指定客户无明细时直接返回', async () => {
    mockAppQuery.mockResolvedValueOnce({ rows: [] });

    await detectHoardChangesByCustomer('客户B');

    expect(mockFetchCustomerData).not.toHaveBeenCalled();
  });

  it('指定客户有压单变更: 使用期限压单选项', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, task_id: 2, erp_bill_id: 'B3', left_amount: 500, status: 'pending', hoard_tag: null, consumer_name: '客户B', task_status: 'collecting' },
      ],
    });

    mockFetchCustomerData.mockResolvedValue({ nameToTraderId: new Map([['客户B', 200]]) });
    mockFetchHoardTags.mockResolvedValue(new Map([['B3', AR_HOARD_TAG_HOARD]]));

    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve({ rows: [] });
      if (sql.includes('COALESCE(SUM')) {
        return Promise.resolve({ rows: [{ total: '0', cnt: '0' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await detectHoardChangesByCustomer('客户B', {
      holdType: AR_HOLD_TYPE_TIME_LIMITED,
      holdDays: 15,
    });

    // 验证期限压单参数传递
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('hold_type = $3::varchar'),
      expect.arrayContaining([AR_DETAIL_STATUS_HOARD_EXCLUDED, AR_HOARD_TAG_HOARD, AR_HOLD_TYPE_TIME_LIMITED, 15])
    );
  });

  it('未传入holdOptions时默认长期压单', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, task_id: 1, erp_bill_id: 'B1', left_amount: 100, status: 'pending', hoard_tag: null, consumer_name: '客户C', task_status: 'collecting' },
      ],
    });

    mockFetchCustomerData.mockResolvedValue({ nameToTraderId: new Map([['客户C', 300]]) });
    mockFetchHoardTags.mockResolvedValue(new Map([['B1', AR_HOARD_TAG_HOARD]]));

    const client = createMockClient();
    client.query.mockImplementation((sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT') return Promise.resolve({ rows: [] });
      if (sql.includes('COALESCE(SUM')) {
        return Promise.resolve({ rows: [{ total: '0', cnt: '0' }] });
      }
      return Promise.resolve({ rows: [] });
    });
    mockGetAppClient.mockResolvedValue(client);

    await detectHoardChangesByCustomer('客户C');

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('hold_type = $3::varchar'),
      expect.arrayContaining([AR_HOLD_TYPE_LONG_TERM])
    );
  });

  it('异常时抛出错误', async () => {
    mockAppQuery.mockRejectedValue(new Error('Customer detect failed'));

    await expect(detectHoardChangesByCustomer('客户D')).rejects.toThrow('Customer detect failed');
  });

  it('已有HOARD标记的明细不重复处理', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [
        { id: 1, task_id: 1, erp_bill_id: 'B1', left_amount: 100, status: 'pending', hoard_tag: AR_HOARD_TAG_HOARD, consumer_name: '客户A', task_status: 'collecting' },
      ],
    });

    mockFetchCustomerData.mockResolvedValue({ nameToTraderId: new Map([['客户A', 100]]) });
    // 仍然是 HOARD，但已经是 HOARD 标记了，不应变更
    mockFetchHoardTags.mockResolvedValue(new Map([['B1', AR_HOARD_TAG_HOARD]]));

    await detectAllHoardChanges();

    // 无变更，不应获取client
    expect(mockGetAppClient).not.toHaveBeenCalled();
  });
});
