/**
 * 坏账处理回调 单元测试
 * @module services/oa/bad-debt-callback.spec
 */

// =====================================================
// Mock 设置
// =====================================================

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../erp-client', () => ({
  createBadDebtExpenditure: jest.fn(),
  createCustomerReceipt: jest.fn(),
  cleanupBadDebtBills: jest.fn(),
}));

import { appQuery } from '../../db/appPool';
import {
  createBadDebtExpenditure,
  createCustomerReceipt,
  cleanupBadDebtBills,
} from '../erp-client';
import {
  handleBadDebtAutoNode,
  handleBadDebtRejected,
} from './bad-debt-callback';
import type { OaInstanceRow } from './oa.types';
import { createFormAccessor } from './form-accessor';

// =====================================================
// 测试辅助
// =====================================================

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockCreateExpenditure = createBadDebtExpenditure as jest.MockedFunction<typeof createBadDebtExpenditure>;
const mockCreateReceipt = createCustomerReceipt as jest.MockedFunction<typeof createCustomerReceipt>;
const mockCleanup = cleanupBadDebtBills as jest.MockedFunction<typeof cleanupBadDebtBills>;

function makeInstance(overrides?: Partial<OaInstanceRow>): OaInstanceRow {
  return {
    id: 100,
    instance_no: 'OA-BAD-001',
    form_type_id: 99,
    title: '坏账处理 - 测试客户',
    form_data: {},
    status: 'processing',
    applicant_id: 1,
    applicant_name: '测试用户',
    applicant_dept: '财务部',
    current_node_order: 2,
    erp_meta: { status: 'pending', responseData: {}, requestLog: null },
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as OaInstanceRow;
}

const billRecords = [
  {
    bizId: 114415,
    bizOrderStr: 'XD240101001',
    billTypeName: '销售单',
    billTypeEnum: 'FUNDS_SALES',
    totalAmount: '1000',
    leftAmount: '715',
  },
  {
    bizId: 99200,
    bizOrderStr: 'XD240201002',
    billTypeName: '销售单',
    billTypeEnum: 'FUNDS_SALES',
    totalAmount: '500',
    leftAmount: '285',
  },
];

const baseFormData = {
  customerId: '6288',
  _customerName: '测试客户',
  billDetails: billRecords, // 完整记录数组（模式一）
  badDebtAmount: '1000',
  badDebtReason: '客户失联，无法收回',
};

// =====================================================
// 测试用例
// =====================================================

describe('handleBadDebtAutoNode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('节点2: 创建坏账费用单成功', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ node_order: 2, node_name: '创建坏账费用单' }],
    } as any);

    mockCreateExpenditure.mockResolvedValueOnce({
      id: 9929,
      billStr: 'KHFY2607030007',
      state: 'APPROVED',
    });

    const instance = makeInstance();
    const result = await handleBadDebtAutoNode(instance, createFormAccessor({ ...baseFormData }));

    expect(mockCreateExpenditure).toHaveBeenCalledWith(
      expect.objectContaining({
        traderId: 6288,
        traderName: '测试客户',
        totalAmount: 1000,
      }),
      'BADDEBT-EXPENSE-100-2'
    );

    expect(result).toEqual({
      erpMeta: {
        expenditureBillId: 9929,
        expenditureBillStr: 'KHFY2607030007',
      },
      formData: {
        _expenditureBillId: 9929,
        _expenditureBillStr: 'KHFY2607030007',
        expenditureBillNo: 'KHFY2607030007',
      },
    });
  });

  it('节点3: 构造 invoiceList 正确（2条应收 + 1条费用单）', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ node_order: 3, node_name: '创建收款单核销' }],
    } as any);

    mockCreateReceipt.mockResolvedValueOnce({
      id: 83075,
      paidBillStr: 'SK26070300032',
      state: 'APPROVED',
    });

    const instance = makeInstance();
    const formDataWithExpense = {
      ...baseFormData,
      _expenditureBillId: 9929,
      _expenditureBillStr: 'KHFY2607030007',
    };

    const result = await handleBadDebtAutoNode(instance, createFormAccessor(formDataWithExpense));

    expect(mockCreateReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        traderId: 6288,
        invoiceList: expect.arrayContaining([
          expect.objectContaining({
            bizId: 114415,
            bizType: 'FUNDS_SALES',
            paidAmount: '715',
            leftAmount: '715',
          }),
          expect.objectContaining({
            bizId: 99200,
            bizType: 'FUNDS_SALES',
            paidAmount: '285',
            leftAmount: '285',
          }),
          expect.objectContaining({
            bizId: 9929,
            bizType: 'CONSUMER_EXPENDITURE',
            paidAmount: '-1000',
            leftAmount: '-1000',
          }),
        ]),
      }),
      'BADDEBT-RECEIVE-100-3'
    );

    expect(result).toEqual({
      erpMeta: {
        receiptBillId: 83075,
        receiptBillStr: 'SK26070300032',
      },
      formData: {
        _receiptBillId: 83075,
        _receiptBillStr: 'SK26070300032',
        receiptBillNo: 'SK26070300032',
      },
    });
  });

  it('节点3: 金额精度 — leftAmount=[715,285] 时费用单 paidAmount=-1000', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ node_order: 3, node_name: '创建收款单核销' }],
    } as any);

    mockCreateReceipt.mockResolvedValueOnce({
      id: 83076,
      paidBillStr: 'SK26070300033',
      state: 'APPROVED',
    });

    const instance = makeInstance();
    const formDataWithExpense = {
      ...baseFormData,
      _expenditureBillId: 9929,
      _expenditureBillStr: 'KHFY2607030007',
    };

    await handleBadDebtAutoNode(instance, createFormAccessor(formDataWithExpense));

    const callArgs = mockCreateReceipt.mock.calls[0][0];
    const expenditureLine = callArgs.invoiceList.find(
      (item: any) => item.bizType === 'CONSUMER_EXPENDITURE'
    );

    expect(expenditureLine).toBeDefined();
    // 确保是字符串 '-1000'，不是浮点数运算结果
    expect(expenditureLine!.paidAmount).toBe('-1000');
    expect(typeof expenditureLine!.paidAmount).toBe('string');
  });

  it('节点2: 幂等前置检查 — formData 已有 _expenditureBillId 时跳过创建', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ node_order: 2, node_name: '创建坏账费用单' }],
    } as any);

    const instance = makeInstance();
    const formDataWithExisting = {
      ...baseFormData,
      _expenditureBillId: 9929,
      _expenditureBillStr: 'KHFY2607030007',
    };

    const result = await handleBadDebtAutoNode(instance, createFormAccessor(formDataWithExisting));

    expect(mockCreateExpenditure).not.toHaveBeenCalled();
    expect(result).toEqual({
      erpMeta: {
        expenditureBillId: 9929,
        expenditureBillStr: 'KHFY2607030007',
      },
    });
  });

  it('节点3: 幂等前置检查 — formData 已有 _receiptBillId 时跳过创建', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ node_order: 3, node_name: '创建收款单核销' }],
    } as any);

    const instance = makeInstance();
    const formDataWithExisting = {
      ...baseFormData,
      _expenditureBillId: 9929,
      _expenditureBillStr: 'KHFY2607030007',
      _receiptBillId: 83075,
      _receiptBillStr: 'SK26070300032',
    };

    const result = await handleBadDebtAutoNode(instance, createFormAccessor(formDataWithExisting));

    expect(mockCreateReceipt).not.toHaveBeenCalled();
    expect(result).toEqual({
      erpMeta: {
        receiptBillId: 83075,
        receiptBillStr: 'SK26070300032',
      },
    });
  });
});

describe('handleBadDebtRejected', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('驳回回滚（全量）: 费用单+收款单均已创建', async () => {
    mockCleanup.mockResolvedValueOnce(undefined);

    const instance = makeInstance();
    const formData = {
      ...baseFormData,
      _expenditureBillId: 9929,
      _expenditureBillStr: 'KHFY2607030007',
      _receiptBillId: 83075,
      _receiptBillStr: 'SK26070300032',
    };

    await handleBadDebtRejected(instance, createFormAccessor(formData));

    expect(mockCleanup).toHaveBeenCalledWith(9929, 83075);
  });

  it('驳回回滚（仅费用单）: 收款单未创建', async () => {
    mockCleanup.mockResolvedValueOnce(undefined);

    const instance = makeInstance();
    const formData = {
      ...baseFormData,
      _expenditureBillId: 9929,
      _expenditureBillStr: 'KHFY2607030007',
    };

    await handleBadDebtRejected(instance, createFormAccessor(formData));

    expect(mockCleanup).toHaveBeenCalledWith(9929, undefined);
  });

  it('驳回回滚（无单据）: 跳过清理', async () => {
    const instance = makeInstance();
    await handleBadDebtRejected(instance, createFormAccessor({ ...baseFormData }));

    expect(mockCleanup).not.toHaveBeenCalled();
  });
});
