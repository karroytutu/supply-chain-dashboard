jest.mock('../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../services/fixed-asset/fixed-asset.query', () => ({
  searchErpAssets: jest.fn(),
  getErpAssetDetail: jest.fn(),
  getErpDepartments: jest.fn(),
  getErpStaff: jest.fn(),
  getErpPaymentAccounts: jest.fn(),
  getErpAssetCategories: jest.fn(),
}));

jest.mock('../services/erp-client/erp-customer.service', () => ({
  searchErpCustomersByKeyword: jest.fn(),
  getErpCustomerProfile: jest.fn(),
  getCustomerLicenseInfo: jest.fn(),
  getCustomerDebtTotal: jest.fn(),
}));

jest.mock('../services/erp-client/erp-customer-reference.service', () => ({
  getErpGrades: jest.fn(),
  getErpGroups: jest.fn(),
  getErpAreas: jest.fn(),
}));

jest.mock('../services/erp-client/erp-settlement.service', () => ({
  searchErpSettlementOrders: jest.fn(),
  searchErpSettlementOrdersPaged: jest.fn(),
}));

jest.mock('../services/fixed-asset/erp-meta-utils', () => ({
  retryErpOperation: jest.fn(),
}));

jest.mock('../services/oa/oa.mutation', () => ({
  retryAutoNode: jest.fn(),
}));

import {
  getErpReference,
  retryErpOperation,
  retryAutoNode,
  resolveErpReference,
  getCustomerLicense,
  getCustomerDebt,
} from './erp-reference.controller';
import {
  searchErpAssets,
  getErpDepartments,
  getErpStaff,
  getErpPaymentAccounts,
  getErpAssetCategories,
} from '../services/fixed-asset/fixed-asset.query';
import {
  searchErpCustomersByKeyword,
  getCustomerLicenseInfo,
  getCustomerDebtTotal,
} from '../services/erp-client/erp-customer.service';
import {
  getErpGrades,
  getErpGroups,
  getErpAreas,
} from '../services/erp-client/erp-customer-reference.service';
import {
  searchErpSettlementOrders,
  searchErpSettlementOrdersPaged,
} from '../services/erp-client/erp-settlement.service';
import { retryErpOperation as retryErpOp } from '../services/fixed-asset/erp-meta-utils';
import { retryAutoNode as retryAutoNodeService } from '../services/oa/oa.mutation';
import { createMockRequest, createMockResponse, createMockNext } from '../__tests__/helpers/testFactory';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('getErpReference', () => {
  it('assets 类型', async () => {
    (searchErpAssets as jest.Mock).mockResolvedValueOnce([{ id: 1 }]);
    const req = createMockRequest({ params: { type: 'assets' }, query: { keyword: 'test' } });
    const res = createMockResponse();
    const next = createMockNext();
    await getErpReference(req, res, next);
    expect(searchErpAssets).toHaveBeenCalledWith('test', '');
    expect(res.json).toHaveBeenCalledWith({ code: 200, data: [{ id: 1 }] });
  });

  it('departments 类型', async () => {
    (getErpDepartments as jest.Mock).mockResolvedValueOnce([{ deptId: 1 }]);
    const req = createMockRequest({ params: { type: 'departments' }, query: {} });
    const res = createMockResponse();
    await getErpReference(req, res, createMockNext());
    expect(res.json).toHaveBeenCalledWith({ code: 200, data: [{ deptId: 1 }] });
  });

  it('staff 类型', async () => {
    (getErpStaff as jest.Mock).mockResolvedValueOnce([{ id: 1 }]);
    const req = createMockRequest({ params: { type: 'staff' }, query: {} });
    const res = createMockResponse();
    await getErpReference(req, res, createMockNext());
    expect(res.json).toHaveBeenCalledWith({ code: 200, data: [{ id: 1 }] });
  });

  it('payment-accounts 类型', async () => {
    (getErpPaymentAccounts as jest.Mock).mockResolvedValueOnce([]);
    const req = createMockRequest({ params: { type: 'payment-accounts' }, query: {} });
    const res = createMockResponse();
    await getErpReference(req, res, createMockNext());
    expect(res.json).toHaveBeenCalledWith({ code: 200, data: [] });
  });

  it('asset-categories 类型', async () => {
    (getErpAssetCategories as jest.Mock).mockResolvedValueOnce([]);
    const req = createMockRequest({ params: { type: 'asset-categories' }, query: {} });
    const res = createMockResponse();
    await getErpReference(req, res, createMockNext());
    expect(res.json).toHaveBeenCalledWith({ code: 200, data: [] });
  });

  it('customers 类型', async () => {
    (searchErpCustomersByKeyword as jest.Mock).mockResolvedValueOnce([{ id: 1 }]);
    const req = createMockRequest({ params: { type: 'customers' }, query: { keyword: 'abc', includeAllStates: 'true' } });
    const res = createMockResponse();
    await getErpReference(req, res, createMockNext());
    expect(searchErpCustomersByKeyword).toHaveBeenCalledWith('abc', { includeAllStates: true });
  });

  it('grades/groups/areas 类型', async () => {
    (getErpGrades as jest.Mock).mockResolvedValueOnce([{ id: 1 }]);
    (getErpGroups as jest.Mock).mockResolvedValueOnce([{ id: 2 }]);
    (getErpAreas as jest.Mock).mockResolvedValueOnce([{ id: 3 }]);

    for (const type of ['grades', 'groups', 'areas']) {
      const req = createMockRequest({ params: { type }, query: {} });
      const res = createMockResponse();
      await getErpReference(req, res, createMockNext());
      expect(res.json).toHaveBeenCalledWith({ code: 200, data: expect.any(Array) });
    }
  });

  it('settlement-orders 缺少 consumerId 返回 400', async () => {
    const req = createMockRequest({ params: { type: 'settlement-orders' }, query: {} });
    const res = createMockResponse();
    await getErpReference(req, res, createMockNext());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('settlement-orders 分页模式', async () => {
    (searchErpSettlementOrdersPaged as jest.Mock).mockResolvedValueOnce({ rows: [], total: 0 });
    const req = createMockRequest({
      params: { type: 'settlement-orders' },
      query: { consumerId: '100', page: '1', page_size: '10' },
    });
    const res = createMockResponse();
    await getErpReference(req, res, createMockNext());
    expect(searchErpSettlementOrdersPaged).toHaveBeenCalled();
  });

  it('settlement-orders 全量模式', async () => {
    (searchErpSettlementOrders as jest.Mock).mockResolvedValueOnce([]);
    const req = createMockRequest({
      params: { type: 'settlement-orders' },
      query: { consumerId: '100' },
    });
    const res = createMockResponse();
    await getErpReference(req, res, createMockNext());
    expect(searchErpSettlementOrders).toHaveBeenCalled();
  });

  it('不支持的类型返回 400', async () => {
    const req = createMockRequest({ params: { type: 'unknown' }, query: {} });
    const res = createMockResponse();
    await getErpReference(req, res, createMockNext());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('异常调用 next', async () => {
    (searchErpAssets as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    const req = createMockRequest({ params: { type: 'assets' }, query: {} });
    const res = createMockResponse();
    const next = createMockNext();
    await getErpReference(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('retryErpOperation', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await retryErpOperation(req, res, createMockNext());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('成功触发重试', async () => {
    (retryErpOp as jest.Mock).mockResolvedValueOnce(undefined);
    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();
    await retryErpOperation(req, res, createMockNext());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });

  it('异常返回 500', async () => {
    (retryErpOp as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();
    await retryErpOperation(req, res, createMockNext());
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('retryAutoNode', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await retryAutoNode(req, res, createMockNext());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('成功触发', async () => {
    (retryAutoNodeService as jest.Mock).mockResolvedValueOnce(undefined);
    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();
    await retryAutoNode(req, res, createMockNext());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 200 }));
  });

  it('客户端错误返回 400', async () => {
    (retryAutoNodeService as jest.Mock).mockRejectedValueOnce(new Error('节点不存在'));
    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();
    await retryAutoNode(req, res, createMockNext());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('系统错误返回 500', async () => {
    (retryAutoNodeService as jest.Mock).mockRejectedValueOnce(new Error('未知错误'));
    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();
    await retryAutoNode(req, res, createMockNext());
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('resolveErpReference', () => {
  it('缺少 ids 返回 400', async () => {
    const req = createMockRequest({ params: { type: 'customers' }, query: {} });
    const res = createMockResponse();
    await resolveErpReference(req, res, createMockNext());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('无效 ids 返回 400', async () => {
    const req = createMockRequest({ params: { type: 'customers' }, query: { ids: 'abc' } });
    const res = createMockResponse();
    await resolveErpReference(req, res, createMockNext());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('departments 解析', async () => {
    (getErpDepartments as jest.Mock).mockResolvedValueOnce([
      { deptId: 1, deptName: 'Sales' },
    ]);
    const req = createMockRequest({ params: { type: 'departments' }, query: { ids: '1' } });
    const res = createMockResponse();
    await resolveErpReference(req, res, createMockNext());
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: [{ id: 1, label: 'Sales' }] })
    );
  });

  it('不支持的类型返回 400', async () => {
    const req = createMockRequest({ params: { type: 'unknown' }, query: { ids: '1' } });
    const res = createMockResponse();
    await resolveErpReference(req, res, createMockNext());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('getCustomerLicense', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: 'bad' } });
    const res = createMockResponse();
    await getCustomerLicense(req, res, createMockNext());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('成功返回执照信息', async () => {
    (getCustomerLicenseInfo as jest.Mock).mockResolvedValueOnce({ hasLicense: true });
    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();
    await getCustomerLicense(req, res, createMockNext());
    expect(res.json).toHaveBeenCalledWith({ code: 200, data: { hasLicense: true } });
  });

  it('ERP 不可用时降级', async () => {
    (getCustomerLicenseInfo as jest.Mock).mockRejectedValueOnce(new Error('ERP down'));
    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();
    await getCustomerLicense(req, res, createMockNext());
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { hasLicense: false, imageCount: 0, attachedPicUrls: [] } })
    );
  });
});

describe('getCustomerDebt', () => {
  it('无效 ID 返回 400', async () => {
    const req = createMockRequest({ params: { id: '0' } });
    const res = createMockResponse();
    await getCustomerDebt(req, res, createMockNext());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('成功返回欠款', async () => {
    (getCustomerDebtTotal as jest.Mock).mockResolvedValueOnce(5000);
    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();
    await getCustomerDebt(req, res, createMockNext());
    expect(res.json).toHaveBeenCalledWith({ code: 200, data: { debtAmount: 5000 } });
  });

  it('ERP 不可用时降级返回 null', async () => {
    (getCustomerDebtTotal as jest.Mock).mockRejectedValueOnce(new Error('fail'));
    const req = createMockRequest({ params: { id: '1' } });
    const res = createMockResponse();
    await getCustomerDebt(req, res, createMockNext());
    expect(res.json).toHaveBeenCalledWith({ code: 200, data: { debtAmount: null } });
  });
});
