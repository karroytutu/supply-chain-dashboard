/**
 * 退货单钉钉通知服务单元测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../dingtalk.service', () => ({
  sendWorkNotification: jest.fn().mockResolvedValue({ errcode: 0 }),
}));

import { appQuery } from '../../db/appPool';
import { sendWorkNotification } from '../dingtalk.service';
import {
  sendDailyNewReturnReminder,
  sendDailyPendingErpReminder,
  notifyCannotPurchaseReturn,
  notifyPendingWarehouseExecute,
  notifyNewReturnOrder,
  notifyPendingErpFill,
  notifyPendingMarketingSale,
} from './return-order-notify';
import type { ReturnOrder } from './return-order.types';

const mockQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockSend = sendWorkNotification as jest.MockedFunction<typeof sendWorkNotification>;

const mkOrder = (overrides: Partial<ReturnOrder> = {}): ReturnOrder => ({
  id: 1,
  returnNo: 'RT-20260601-001',
  goodsId: 'G001',
  goodsName: '测试商品',
  quantity: 10,
  unit: '件',
  batchDate: null,
  returnDate: null,
  expireDate: null,
  shelfLife: null,
  daysToExpire: 30,
  daysToExpireAtReturn: null,
  status: 'pending_confirm',
  sourceBillNo: null,
  consumerName: '客户A',
  marketingManager: '李营销',
  erpReturnNo: null,
  erpFilledBy: null,
  erpFilledAt: null,
  warehouseExecutedBy: null,
  warehouseExecutedAt: null,
  warehouseReturnQuantity: null,
  warehouseEvidenceUrl: null,
  warehouseComment: null,
  marketingCompletedBy: null,
  marketingCompletedAt: null,
  marketingComment: null,
  ruleId: null,
  purchasePrice: null,
  ruleConfirmedAt: null,
  ruleConfirmedBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  currentStock: null,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSend.mockResolvedValue({ errcode: 0 } as any);
});

describe('sendDailyNewReturnReminder', () => {
  it('无订单时跳过推送', async () => {
    await sendDailyNewReturnReminder([]);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('无采购主管时跳过推送', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    await sendDailyNewReturnReminder([mkOrder()]);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('有订单且有主管时发送通知', async () => {
    // getDingtalkUserIdsByRole
    mockQuery.mockResolvedValueOnce({ rows: [{ dingtalk_user_id: 'dt_001' }] } as any);
    // getUserNamesByRole
    mockQuery.mockResolvedValueOnce({ rows: [{ name: '王主管' }] } as any);
    await sendDailyNewReturnReminder([mkOrder(), mkOrder({ returnNo: 'RT-002' })]);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [userIds, title] = mockSend.mock.calls[0];
    expect(userIds).toEqual(['dt_001']);
    expect(title).toContain('2 条');
  });

  it('过滤 dev_admin 用户', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ dingtalk_user_id: 'dev_admin' }] } as any);
    await sendDailyNewReturnReminder([mkOrder()]);
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('sendDailyPendingErpReminder', () => {
  it('无订单时跳过推送', async () => {
    await sendDailyPendingErpReminder([]);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('有订单时发送待填ERP提醒', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ dingtalk_user_id: 'dt_002' }] } as any);
    mockQuery.mockResolvedValueOnce({ rows: [{ name: '采购' }] } as any);
    await sendDailyPendingErpReminder([mkOrder()]);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [, title] = mockSend.mock.calls[0];
    expect(title).toContain('待填写');
  });
});

describe('notifyCannotPurchaseReturn', () => {
  it('有责任营销师时发送通知', async () => {
    // getDingtalkUserIdByName
    mockQuery.mockResolvedValueOnce({ rows: [{ dingtalk_user_id: 'dt_marketer' }] } as any);
    await notifyCannotPurchaseReturn(mkOrder());
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [userIds, title] = mockSend.mock.calls[0];
    expect(userIds).toEqual(['dt_marketer']);
    expect(title).toContain('无法采购退货');
  });

  it('无责任营销师时跳过', async () => {
    await notifyCannotPurchaseReturn(mkOrder({ marketingManager: null }));
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('找不到营销师钉钉ID时跳过', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    await notifyCannotPurchaseReturn(mkOrder());
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('营销师为 dev_admin 时跳过', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ dingtalk_user_id: 'dev_admin' }] } as any);
    await notifyCannotPurchaseReturn(mkOrder());
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('notifyPendingWarehouseExecute', () => {
  it('有仓储主管时发送通知', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ dingtalk_user_id: 'dt_wh' }] } as any);
    mockQuery.mockResolvedValueOnce({ rows: [{ name: '仓管' }] } as any);
    await notifyPendingWarehouseExecute(mkOrder(), 'ERP-RT-001');
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [, title] = mockSend.mock.calls[0];
    expect(title).toContain('待退货');
  });

  it('无仓储主管时跳过', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    await notifyPendingWarehouseExecute(mkOrder(), 'ERP-RT-001');
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('notifyNewReturnOrder (deprecated)', () => {
  it('有采购主管时发送通知', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ dingtalk_user_id: 'dt_001' }] } as any);
    await notifyNewReturnOrder(mkOrder());
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [, title] = mockSend.mock.calls[0];
    expect(title).toContain('新临期退货单');
  });

  it('无接收者时跳过', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);
    await notifyNewReturnOrder(mkOrder());
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('notifyPendingErpFill (deprecated)', () => {
  it('有采购主管时发送通知', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ dingtalk_user_id: 'dt_001' }] } as any);
    await notifyPendingErpFill(mkOrder());
    expect(mockSend).toHaveBeenCalledTimes(1);
    const [, title] = mockSend.mock.calls[0];
    expect(title).toContain('待填写ERP');
  });
});

describe('notifyPendingMarketingSale (deprecated)', () => {
  it('委托给 notifyCannotPurchaseReturn', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ dingtalk_user_id: 'dt_m' }] } as any);
    await notifyPendingMarketingSale(mkOrder());
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
