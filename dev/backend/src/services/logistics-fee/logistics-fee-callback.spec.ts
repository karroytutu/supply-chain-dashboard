/**
 * 物流费用 auto 节点回调单元测试
 * @module services/logistics-fee/logistics-fee-callback.spec
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../fixed-asset/erp-meta-utils', () => ({
  getErpMeta: jest.fn(),
}));

jest.mock('../erp-client/erp-expense-allocation.service', () => ({
  createSupplierExpenseBill: jest.fn(),
  createExpenseAllocation: jest.fn(),
  cancelExpenseAllocation: jest.fn(),
  buildLogisticsFeeIdemKey: jest.fn((type: string, id: number, node: number) => `LOGISTICS_${type}_${id}_${node}`),
}));

jest.mock('../erp-client/erp-purchase.service', () => ({
  createPaidBill: jest.fn(),
  deApprovePaidBill: jest.fn(),
  cancelPaidBill: jest.fn(),
}));

jest.mock('../erp-client/erp-purchase-settlement.service', () => ({
  getAllocatableExpenseDetails: jest.fn(),
  getAllocatablePurchaseDetails: jest.fn(),
}));

jest.mock('../erp-client/erp-config', () => ({
  getErpDefaults: jest.fn(() => ({ defaultSalesmanId: '100', defaultDeptId: '200', cid: 1, uid: 1 })),
  getErpConfig: jest.fn(() => ({ baseUrl: 'http://erp.test' })),
}));

jest.mock('../erp-client/erp-cleanup', () => ({
  cleanupExpenditureBill: jest.fn(),
}));

jest.mock('../oa/form-types/logistics-fee', () => ({
  FEE_SUBJECT_MAP: {
    logistics_fee: { subjectId: 401, subjectName: '物流费用' },
    loading_fee: { subjectId: 400, subjectName: '卸货费' },
  },
}));

import { appQuery } from '../../db/appPool';
import { getErpMeta } from '../fixed-asset/erp-meta-utils';
import {
  createSupplierExpenseBill,
  createExpenseAllocation,
  cancelExpenseAllocation,
} from '../erp-client/erp-expense-allocation.service';
import {
  createPaidBill,
  deApprovePaidBill,
  cancelPaidBill,
} from '../erp-client/erp-purchase.service';
import { getAllocatableExpenseDetails, getAllocatablePurchaseDetails } from '../erp-client/erp-purchase-settlement.service';
import { cleanupExpenditureBill } from '../erp-client/erp-cleanup';
import {
  handleLogisticsFeeAutoNode,
  handleLogisticsFeeRejected,
} from './logistics-fee-callback';
import type { OaInstanceRow } from '../oa/oa.types';

// =====================================================
// 测试辅助
// =====================================================

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockGetErpMeta = getErpMeta as jest.MockedFunction<typeof getErpMeta>;

function makeInstance(overrides: Partial<OaInstanceRow> = {}): OaInstanceRow {
  return {
    id: 1,
    instance_no: 'OA20260101001',
    title: '物流费用测试',
    status: 'processing',
    form_type_id: 10,
    form_type_code: 'logistics_fee',
    applicant_id: 1,
    applicant_name: '测试用户',
    form_data: {},
    erp_meta: null,
    current_node_order: 3,
    urgency: 'normal',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  } as OaInstanceRow;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// =====================================================
// handleLogisticsFeeAutoNode — 节点分发
// =====================================================

describe('handleLogisticsFeeAutoNode', () => {
  it('应调用节点3创建费用单', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ node_order: 3, node_name: '创建费用单' }],
    } as any);

    (createSupplierExpenseBill as jest.Mock).mockResolvedValueOnce({
      id: 1001,
      billStr: 'FY20260101001',
    });

    const instance = makeInstance();
    const formData = {
      feeSupplierId: 'S001',
      feeSupplierName: '测试供应商',
      feeType: 'logistics_fee',
      feeLines: [{ feeAmount: 1000 }],
    };

    const result = await handleLogisticsFeeAutoNode(instance, formData);

    expect(createSupplierExpenseBill).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      erpMeta: { expenditureBillId: 1001, expenditureBillStr: 'FY20260101001' },
    });
  });

  it('应调用节点4创建付款单', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ node_order: 4, node_name: '创建付款单' }],
    } as any);

    mockGetErpMeta.mockReturnValueOnce({
      responseData: { expenditureBillId: 1001, expenditureTotalAmount: 1000 },
    } as any);

    (createPaidBill as jest.Mock).mockResolvedValueOnce({
      id: 2001,
      paidBillStr: 'FK20260101001',
    });

    const instance = makeInstance();
    const formData = {
      paymentAmount: '1000',
      paymentSubjectId: 10,
      feeSupplierId: 'S001',
      feeType: 'logistics_fee',
    };

    const result = await handleLogisticsFeeAutoNode(instance, formData);

    expect(createPaidBill).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      erpMeta: { paidBillId: 2001 },
    });
  });

  it('未知节点应不执行任何操作', async () => {
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ node_order: 99, node_name: '未知' }],
    } as any);

    const instance = makeInstance();
    const result = await handleLogisticsFeeAutoNode(instance, {});

    expect(result).toBeUndefined();
    expect(createSupplierExpenseBill).not.toHaveBeenCalled();
    expect(createPaidBill).not.toHaveBeenCalled();
  });
});

// =====================================================
// 节点3: handleCreateExpenseBill
// =====================================================

describe('节点3: 创建费用单', () => {
  function setupNode3Query() {
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ node_order: 3, node_name: '创建费用单' }],
    } as any);
  }

  it('缺少费用供应商时应抛出错误', async () => {
    setupNode3Query();
    const instance = makeInstance();
    const formData = { feeType: 'logistics_fee', feeLines: [{ feeAmount: 100 }] };

    await expect(handleLogisticsFeeAutoNode(instance, formData))
      .rejects.toThrow('缺少费用供应商、费用类型或费用明细');
  });

  it('未知费用类型应抛出错误', async () => {
    setupNode3Query();
    const instance = makeInstance();
    const formData = {
      feeSupplierId: 'S001',
      feeSupplierName: '测试供应商',
      feeType: 'unknown_type',
      feeLines: [{ feeAmount: 100 }],
    };

    await expect(handleLogisticsFeeAutoNode(instance, formData))
      .rejects.toThrow('未知的费用类型');
  });

  it('应正确计算总金额并传递 FEE_SUBJECT_MAP 映射', async () => {
    setupNode3Query();
    (createSupplierExpenseBill as jest.Mock).mockResolvedValueOnce({
      id: 1001,
      billStr: 'FY001',
    });

    const instance = makeInstance();
    const formData = {
      feeSupplierId: 'S001',
      feeSupplierName: '测试供应商',
      feeType: 'logistics_fee',
      feeLines: [{ feeAmount: 500 }, { feeAmount: 300 }],
    };

    await handleLogisticsFeeAutoNode(instance, formData);

    const callArgs = (createSupplierExpenseBill as jest.Mock).mock.calls[0];
    const payload = callArgs[0];

    // 总金额应为 800
    expect(payload.totalAmount).toBe(800);
    // 费用科目应为物流费用（401）
    expect(payload.details[0].subjectId).toBe(401);
    expect(payload.details[0].subjectName).toBe('物流费用');
    // 应有两条明细
    expect(payload.details).toHaveLength(2);
  });

  it('卸货费应映射到 subjectId 400', async () => {
    setupNode3Query();
    (createSupplierExpenseBill as jest.Mock).mockResolvedValueOnce({
      id: 1002,
      billStr: 'FY002',
    });

    const instance = makeInstance();
    const formData = {
      feeSupplierId: 'S001',
      feeSupplierName: '测试供应商',
      feeType: 'loading_fee',
      feeLines: [{ feeAmount: 200 }],
    };

    await handleLogisticsFeeAutoNode(instance, formData);

    const payload = (createSupplierExpenseBill as jest.Mock).mock.calls[0][0];
    expect(payload.details[0].subjectId).toBe(400);
    expect(payload.details[0].subjectName).toBe('卸货费');
  });
});

// =====================================================
// 节点5: 费用分摊 — 倒挤法验证
// =====================================================

describe('节点5: 费用分摊倒挤法', () => {
  function setupNode5Query() {
    mockAppQuery.mockResolvedValueOnce({
      rows: [{ node_order: 5, node_name: '创建费用分摊单' }],
    } as any);
  }

  it('最后一行应使用倒挤法保证总和精确', async () => {
    setupNode5Query();

    mockGetErpMeta.mockReturnValueOnce({
      responseData: { expenditureBillStr: 'FY001', expenditureTotalAmount: 1000 },
    } as any);

    (getAllocatableExpenseDetails as jest.Mock).mockResolvedValueOnce({
      records: [{ id: 100, amount: 1000 }],
    });

    (createExpenseAllocation as jest.Mock).mockResolvedValueOnce({
      id: 3001,
      billStr: 'FT001',
    });

    const instance = makeInstance();
    const formData = {
      paymentAmount: '1000.00',
      _settlementLineItems: JSON.stringify([
        { bizDetailId: 1, amount: '333.33' },
        { bizDetailId: 2, amount: '333.33' },
        { bizDetailId: 3, amount: '333.34' },
      ]),
    };

    await handleLogisticsFeeAutoNode(instance, formData);

    const callArgs = (createExpenseAllocation as jest.Mock).mock.calls[0];
    const payload = callArgs[0];
    const settleDetail = payload.settleDetail;

    // 前两行按比例计算
    const allocAmounts = settleDetail.map((d: any) => parseFloat(d.allocationAmount));
    // 最后一行应为 1000 - (前两行之和)，保证总和精确等于 1000
    const sum = allocAmounts.reduce((a: number, b: number) => a + b, 0);
    expect(sum).toBeCloseTo(1000, 2);
    expect(settleDetail).toHaveLength(3);
  });

  it('结算单行项为空时应兜底重查 ERP', async () => {
    setupNode5Query();

    mockGetErpMeta.mockReturnValueOnce({
      responseData: { expenditureBillStr: 'FY001', expenditureTotalAmount: 1000 },
    } as any);

    (getAllocatableExpenseDetails as jest.Mock).mockResolvedValueOnce({
      records: [{ id: 100, amount: 1000 }],
    });

    // 兜底重查返回数据
    (getAllocatablePurchaseDetails as jest.Mock).mockResolvedValueOnce({
      records: [
        { id: 1, amount: '500.00', goodsName: '商品A', billStr: 'JS001' },
        { id: 2, amount: '500.00', goodsName: '商品B', billStr: 'JS001' },
      ],
    });

    (createExpenseAllocation as jest.Mock).mockResolvedValueOnce({
      id: 3001,
      billStr: 'FT001',
    });

    const instance = makeInstance();
    const formData = {
      paymentAmount: '1000',
      _settlementLineItems: JSON.stringify([]),
      feeLines: [
        { settlementBillStr: 'JS001', goodsName: '商品A' },
      ],
    };

    await handleLogisticsFeeAutoNode(instance, formData);

    // 应调用兜底重查
    expect(getAllocatablePurchaseDetails).toHaveBeenCalledWith({ billStr: 'JS001' });
    // 应成功创建分摊单
    expect(createExpenseAllocation).toHaveBeenCalledTimes(1);
  });

  it('兜底重查 ERP 也返回空时应抛出错误', async () => {
    setupNode5Query();

    mockGetErpMeta.mockReturnValueOnce({
      responseData: { expenditureBillStr: 'FY001', expenditureTotalAmount: 1000 },
    } as any);

    (getAllocatableExpenseDetails as jest.Mock).mockResolvedValueOnce({
      records: [{ id: 100, amount: 1000 }],
    });

    // 兜底重查返回空
    (getAllocatablePurchaseDetails as jest.Mock).mockResolvedValueOnce({
      records: [],
    });

    const instance = makeInstance();
    const formData = {
      paymentAmount: '1000',
      _settlementLineItems: JSON.stringify([]),
      feeLines: [
        { settlementBillStr: 'JS001', goodsName: '商品A' },
      ],
    };

    await expect(handleLogisticsFeeAutoNode(instance, formData))
      .rejects.toThrow(/结算单行项数据为空.*兜底重查/);
  });

  it('兜底重查 ERP 调用异常时应记录 warn 并抛出错误', async () => {
    setupNode5Query();

    mockGetErpMeta.mockReturnValueOnce({
      responseData: { expenditureBillStr: 'FY001', expenditureTotalAmount: 1000 },
    } as any);

    (getAllocatableExpenseDetails as jest.Mock).mockResolvedValueOnce({
      records: [{ id: 100, amount: 1000 }],
    });

    // 兜底重查抛出异常
    (getAllocatablePurchaseDetails as jest.Mock).mockRejectedValueOnce(
      new Error('ERP 接口超时')
    );

    const instance = makeInstance();
    const formData = {
      paymentAmount: '1000',
      _settlementLineItems: JSON.stringify([]),
      feeLines: [
        { settlementBillStr: 'JS001', goodsName: '商品A' },
      ],
    };

    await expect(handleLogisticsFeeAutoNode(instance, formData))
      .rejects.toThrow(/结算单行项数据为空.*兜底重查/);
  });
});

// =====================================================
// 驳回回滚
// =====================================================

describe('handleLogisticsFeeRejected', () => {
  it('无 ERP 单据时应直接返回', async () => {
    mockGetErpMeta.mockReturnValueOnce(null as any);

    const instance = makeInstance();
    await expect(handleLogisticsFeeRejected(instance, {})).resolves.toBeUndefined();

    expect(cancelExpenseAllocation).not.toHaveBeenCalled();
    expect(deApprovePaidBill).not.toHaveBeenCalled();
    expect(cleanupExpenditureBill).not.toHaveBeenCalled();
  });

  it('全部回滚成功时不应抛出异常', async () => {
    mockGetErpMeta.mockReturnValueOnce({
      responseData: {
        allocationBillId: 3001,
        paidBillId: 2001,
        expenditureBillId: 1001,
      },
    } as any);

    (cancelExpenseAllocation as jest.Mock).mockResolvedValueOnce(undefined);
    (deApprovePaidBill as jest.Mock).mockResolvedValueOnce(undefined);
    (cancelPaidBill as jest.Mock).mockResolvedValueOnce(undefined);
    (cleanupExpenditureBill as jest.Mock).mockResolvedValueOnce(undefined);

    const instance = makeInstance();
    await expect(handleLogisticsFeeRejected(instance, {})).resolves.toBeUndefined();

    // 验证反向顺序：分摊单 → 付款单 → 费用单
    expect(cancelExpenseAllocation).toHaveBeenCalledWith(3001);
    expect(deApprovePaidBill).toHaveBeenCalledWith(2001);
    expect(cancelPaidBill).toHaveBeenCalledWith(2001);
    expect(cleanupExpenditureBill).toHaveBeenCalledWith(1001);
  });

  it('部分回滚失败时应抛出异常并汇总失败信息', async () => {
    mockGetErpMeta.mockReturnValueOnce({
      responseData: {
        allocationBillId: 3001,
        paidBillId: 2001,
        expenditureBillId: 1001,
      },
    } as any);

    (cancelExpenseAllocation as jest.Mock).mockResolvedValueOnce(undefined);
    (deApprovePaidBill as jest.Mock).mockRejectedValueOnce(new Error('ERP 连接超时'));
    (cleanupExpenditureBill as jest.Mock).mockResolvedValueOnce(undefined);

    const instance = makeInstance();
    await expect(handleLogisticsFeeRejected(instance, {}))
      .rejects.toThrow(/物流费用驳回回滚部分失败.*付款单\(2001\)回滚失败/);
  });

  it('仅有费用单时只回滚费用单', async () => {
    mockGetErpMeta.mockReturnValueOnce({
      responseData: {
        expenditureBillId: 1001,
      },
    } as any);

    (cleanupExpenditureBill as jest.Mock).mockResolvedValueOnce(undefined);

    const instance = makeInstance();
    await handleLogisticsFeeRejected(instance, {});

    expect(cancelExpenseAllocation).not.toHaveBeenCalled();
    expect(deApprovePaidBill).not.toHaveBeenCalled();
    expect(cleanupExpenditureBill).toHaveBeenCalledWith(1001);
  });
});
