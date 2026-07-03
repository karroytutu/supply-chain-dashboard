/**
 * 供应商收入单服务单元测试
 * 验证 createSupplierIncomeBill 请求参数构造和 getIncomeCategories 树形展平逻辑
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));
jest.mock('./erp-client', () => ({
  erpPost: jest.fn().mockResolvedValue({ data: { id: 1222, billStr: 'GYSR2607030003', state: 'APPROVED' } }),
  erpGet: jest.fn().mockResolvedValue({ data: [] }),
  extractErpData: jest.fn((r: any) => r?.data !== undefined ? r.data : r),
}));
jest.mock('./erp-config', () => ({
  getErpDefaults: () => ({ cid: '10008421', uid: '1', defaultSalesmanId: 97, defaultDeptId: 1 }),
  getErpConfig: () => ({
    baseUrl: 'https://test.com', cid: '10008421', uid: '1',
    supplierIncomeBillPath: '/income/save-approve-trade-income',
  }),
}));
jest.mock('./erp-inflight', () => ({
  withInFlightDedup: jest.fn((_key: string, fn: () => Promise<any>) => fn()),
}));
jest.mock('../../utils/cache', () => ({
  cache: {
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
  },
  CACHE_TTL: { LOW_FREQUENCY: 5 * 60 * 1000 },
}));
jest.mock('../../utils/cache-keys', () => ({
  CACHE_KEY: { ERP_INCOME_CATEGORIES_SUPPLIER: 'erp:income:categories:supplier' },
}));

import { createSupplierIncomeBill } from './erp-supplier-income.service';
import { getIncomeCategories } from './erp-income-category.service';
import { erpPost, erpGet } from './erp-client';
import { cache } from '../../utils/cache';

const mockErpPost = erpPost as jest.MockedFunction<typeof erpPost>;
const mockErpGet = erpGet as jest.MockedFunction<typeof erpGet>;
const mockCacheGet = cache.get as jest.MockedFunction<typeof cache.get>;
const mockCacheSet = cache.set as jest.MockedFunction<typeof cache.set>;

beforeEach(() => {
  jest.clearAllMocks();
});

// =====================================================
// createSupplierIncomeBill
// =====================================================

describe('createSupplierIncomeBill', () => {
  const baseParams = {
    traderType: 'SUPPLIER' as const,
    traderId: 404,
    traderName: '独山县杨副食店（刺梨汁）',
    totalAmount: '100',
    details: [{
      id: 1,
      subjectId: 366,
      subjectName: '独山陈列费用收入',
      deptId: 1,
      deptName: '贵州鑫众合商贸有限公司',
      taxRadio: 0,
      taxAmount: '',
      noTaxAmount: '100.00',
      paymentAmount: 100,
    }],
    salesmanId: 97,
    deptId: 1,
    workTime: '2026-07-03 22:04:54',
    note: 'OA123+测试备注',
  };

  it('应使用正确的 ERP 路径和幂等键', async () => {
    const idemKey = 'sb-income-100-5';
    await createSupplierIncomeBill(baseParams, idemKey, 100);

    expect(mockErpPost).toHaveBeenCalledTimes(1);
    const [path, _payload, options] = mockErpPost.mock.calls[0];

    expect(path).toBe('/income/save-approve-trade-income');
    expect(options?.headers?.idemkey).toBe(idemKey);
    expect(options?.businessType).toBe('supplier_income_bill_create');
    expect(options?.businessId).toBe(100);
    expect(options?.pathPrefix).toBe('/saas/pro/');
  });

  it('请求体应包含正确的参数结构', async () => {
    await createSupplierIncomeBill(baseParams, 'test-key');

    const payload = mockErpPost.mock.calls[0][1] as any;
    expect(payload.traderType).toBe('SUPPLIER');
    expect(payload.traderId).toBe(404);
    expect(payload.traderName).toBe('独山县杨副食店（刺梨汁）');
    expect(payload.totalAmount).toBe('100');
    expect(payload.details).toHaveLength(1);
    expect(payload.details[0].subjectId).toBe(366);
    expect(payload.details[0].subjectName).toBe('独山陈列费用收入');
    expect(payload.operatorId).toBe('1');
    expect(payload.cid).toBe('10008421');
    expect(payload.uid).toBe('1');
    expect(payload.imgIds).toEqual([]);
  });

  it('应返回 ERP 响应中的 id 和 billStr', async () => {
    const result = await createSupplierIncomeBill(baseParams, 'test-key');
    expect(result.id).toBe(1222);
    expect(result.billStr).toBe('GYSR2607030003');
    expect(result.state).toBe('APPROVED');
  });

  it('响应缺少 id 时应返回兜底对象', async () => {
    mockErpPost.mockResolvedValueOnce({ data: {} });
    const result = await createSupplierIncomeBill(baseParams, 'test-key');
    expect(result.id).toBe(0);
    expect(result.billStr).toBe('');
    expect(result.state).toBe('');
  });
});

// =====================================================
// getIncomeCategories
// =====================================================

describe('getIncomeCategories', () => {
  const mockTree = [
    {
      id: 365, pid: 0, level: 1, code: '01', text: '独山供应商收入', name: '独山供应商收入',
      state: 'NORMAL', taxRadio: 0,
      children: [
        { id: 366, pid: 365, level: 2, code: '0101', text: '独山陈列费用收入', name: '独山陈列费用收入', state: 'NORMAL', taxRadio: 0, children: null },
        { id: 367, pid: 365, level: 2, code: '0102', text: '独山临期特价收入', name: '独山临期特价收入', state: 'NORMAL', taxRadio: 0, children: null },
      ],
    },
    {
      id: 372, pid: 0, level: 1, code: '02', text: '瓮安供应商收入', name: '瓮安供应商收入',
      state: 'NORMAL', taxRadio: 0,
      children: [
        { id: 373, pid: 372, level: 2, code: '0201', text: '瓮安陈列费用收入', name: '瓮安陈列费用收入', state: 'NORMAL', taxRadio: 0, children: null },
      ],
    },
  ];

  it('应将树形结构展平为叶子节点列表', async () => {
    mockErpGet.mockResolvedValueOnce({ data: mockTree });

    const result = await getIncomeCategories();
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ id: 366, pid: 365, name: '独山陈列费用收入' });
    expect(result[1]).toEqual({ id: 367, pid: 365, name: '独山临期特价收入' });
    expect(result[2]).toEqual({ id: 373, pid: 372, name: '瓮安陈列费用收入' });
  });

  it('缓存命中时应直接返回缓存数据', async () => {
    const cachedData = [{ id: 999, pid: 0, name: '缓存类别' }];
    mockCacheGet.mockReturnValueOnce(cachedData);

    const result = await getIncomeCategories();
    expect(result).toEqual(cachedData);
    expect(mockErpPost).not.toHaveBeenCalled();
  });

  it('应将结果写入缓存', async () => {
    mockErpGet.mockResolvedValueOnce({ data: mockTree });

    await getIncomeCategories();
    expect(mockCacheSet).toHaveBeenCalledTimes(1);
    expect(mockCacheSet.mock.calls[0][0]).toBe('erp:income:categories:supplier');
    expect(mockCacheSet.mock.calls[0][2]).toBe(5 * 60 * 1000); // LOW_FREQUENCY TTL
  });

  it('ERP 返回空树时应返回空数组', async () => {
    mockErpGet.mockResolvedValueOnce({ data: [] });

    const result = await getIncomeCategories();
    expect(result).toEqual([]);
  });

  it('一级节点无 children 时应作为叶子节点', async () => {
    const treeWithLeafParent = [
      { id: 100, pid: 0, level: 1, code: '99', text: '独立类别', name: '独立类别', state: 'NORMAL', taxRadio: 0, children: null },
    ];
    mockErpGet.mockResolvedValueOnce({ data: treeWithLeafParent });

    const result = await getIncomeCategories();
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 100, pid: 0, name: '独立类别' });
  });
});
