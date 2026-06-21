/**
 * 客户授信申请回调单元测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../auth.service', () => ({
  getUserRolesAndPermissions: jest.fn(),
}));

jest.mock('../erp-client/erp-credit-update.service', () => ({
  erpUploadBusinessLicense: jest.fn().mockResolvedValue(undefined),
  erpUpdateCustomerProfile: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../erp-client/erp-settlement.service', () => ({
  erpMarkHoldOrders: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../erp-client/erp-customer.service', () => ({
  getCustomerLicenseInfo: jest.fn(),
  getErpCustomerProfile: jest.fn(),
}));

jest.mock('../fixed-asset/erp-meta-utils', () => ({
  updateErpMetaStatus: jest.fn().mockResolvedValue(undefined),
  markErpFailed: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../middleware/credit-upload', () => ({
  resolveLicenseFilePath: jest.fn((url: string) => `/tmp/${url}`),
}));

jest.mock('../../utils/cache', () => ({
  cache: { invalidate: jest.fn(), get: jest.fn(), set: jest.fn() },
}));

jest.mock('../../utils/constants', () => ({
  CREDIT_SETTLE_METHOD_ON_ACCOUNT: 'on_account',
  AR_HOLD_TYPE_LONG_TERM: 'long_term',
  AR_HOLD_TYPE_TIME_LIMITED: 'time_limited',
  ROLE_CODES: {
    ADMIN: 'admin',
    GENERAL_MANAGER: 'general_manager',
    MARKETING_MANAGER: 'marketing_manager',
    MARKETER: 'marketer',
    CURRENT_ACCOUNTANT: 'current_accountant',
    PROCUREMENT_MANAGER: 'procurement_manager',
  },
}));

jest.mock('../erp-debt/ar-hold-meta.service', () => ({
  upsertHoldMeta: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../credit-license', () => ({
  createDeferredUploadAfterApproval: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('fs', () => {
  const existsMock = jest.fn().mockReturnValue(false);
  return {
    __esModule: true,
    default: { existsSync: existsMock },
    existsSync: existsMock,
  };
});

import { getUserRolesAndPermissions } from '../auth.service';
import {
  erpUploadBusinessLicense,
  erpUpdateCustomerProfile,
} from '../erp-client/erp-credit-update.service';
import { erpMarkHoldOrders } from '../erp-client/erp-settlement.service';
import { getCustomerLicenseInfo, getErpCustomerProfile } from '../erp-client/erp-customer.service';
import { updateErpMetaStatus, markErpFailed } from '../fixed-asset/erp-meta-utils';
import { cache } from '../../utils/cache';
import { upsertHoldMeta } from '../erp-debt/ar-hold-meta.service';
import { existsSync } from 'fs';
import { createDeferredUploadAfterApproval } from '../credit-license';
import {
  resolveCustomerCreditPreviewContext,
  beforeSubmitCustomerCredit,
  onApprovedCustomerCredit,
} from './customer-credit-callback';

const mockGetUserRoles = getUserRolesAndPermissions as jest.MockedFunction<typeof getUserRolesAndPermissions>;
const mockUpdateProfile = erpUpdateCustomerProfile as jest.MockedFunction<typeof erpUpdateCustomerProfile>;
const mockUploadLicense = erpUploadBusinessLicense as jest.MockedFunction<typeof erpUploadBusinessLicense>;
const mockMarkHold = erpMarkHoldOrders as jest.MockedFunction<typeof erpMarkHoldOrders>;
const mockGetLicense = getCustomerLicenseInfo as jest.MockedFunction<typeof getCustomerLicenseInfo>;
const mockGetProfile = getErpCustomerProfile as jest.MockedFunction<typeof getErpCustomerProfile>;
const mockUpdateErpMeta = updateErpMetaStatus as jest.MockedFunction<typeof updateErpMetaStatus>;
const mockMarkFailed = markErpFailed as jest.MockedFunction<typeof markErpFailed>;

const mkInstance = (overrides: any = {}) => ({
  id: 1,
  instance_no: 'OA-001',
  title: '授信申请',
  applicant_id: 10,
  applicant_name: '申请人',
  form_data: {},
  status: 'pending',
  form_type_id: 100,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveCustomerCreditPreviewContext', () => {
  it('返回空上下文', async () => {
    const result = await resolveCustomerCreditPreviewContext({}, 1);
    expect(result).toEqual({ contextFields: {} });
  });
});

describe('beforeSubmitCustomerCredit', () => {
  it('admin 角色可以提交', async () => {
    mockGetUserRoles.mockResolvedValueOnce({ roles: [{ code: 'admin' }] } as any);
    const result = await beforeSubmitCustomerCredit({ customer: 100 }, 1);
    expect(result).toBeDefined();
  });

  it('marketer 角色可以提交', async () => {
    mockGetUserRoles.mockResolvedValueOnce({ roles: [{ code: 'marketer' }] } as any);
    const result = await beforeSubmitCustomerCredit({ customer: 0 }, 1);
    expect(result).toBeDefined();
  });

  it('ERP 查询执照成功时注入执照信息', async () => {
    mockGetUserRoles.mockResolvedValueOnce({ roles: [{ code: 'admin' }] } as any);
    mockGetLicense.mockResolvedValueOnce({ hasLicense: true, attachedPicUrls: ['http://img.jpg'] } as any);
    const result = await beforeSubmitCustomerCredit({ customer: 100 }, 1);
    expect(result._licenseDeferred).toBe(false);
    expect(result._erpLicenseUrls).toEqual(['http://img.jpg']);
  });

  it('ERP 无执照且未上传时标记为延期', async () => {
    mockGetUserRoles.mockResolvedValueOnce({ roles: [{ code: 'admin' }] } as any);
    mockGetLicense.mockResolvedValueOnce({ hasLicense: false, attachedPicUrls: [] } as any);
    const result = await beforeSubmitCustomerCredit({ customer: 100 }, 1);
    expect(result._licenseDeferred).toBe(true);
  });

  it('ERP 执照查询失败时标记为延期', async () => {
    mockGetUserRoles.mockResolvedValueOnce({ roles: [{ code: 'admin' }] } as any);
    mockGetLicense.mockRejectedValueOnce(new Error('ERP down'));
    const result = await beforeSubmitCustomerCredit({ customer: 100 }, 1);
    expect(result._licenseDeferred).toBe(true);
  });

  it('缺少客户名称时从 ERP 补全', async () => {
    mockGetUserRoles.mockResolvedValueOnce({ roles: [{ code: 'admin' }] } as any);
    mockGetLicense.mockResolvedValueOnce({ hasLicense: false, attachedPicUrls: [] } as any);
    mockGetProfile.mockResolvedValueOnce({ name: '测试客户' } as any);
    const result = await beforeSubmitCustomerCredit({ customer: 100 }, 1);
    expect(result._customerName).toBe('测试客户');
  });
});

describe('onApprovedCustomerCredit', () => {
  it('payment_period 类型更新授信字段', async () => {
    const formData = { creditType: 'payment_period', customer: 100, maxOverdueDays: 30 };
    await onApprovedCustomerCredit(mkInstance(), formData);
    expect(mockUpdateErpMeta).toHaveBeenCalledWith(1, 'processing');
    expect(mockUpdateProfile).toHaveBeenCalledWith(100, expect.objectContaining({ maxDebtDays: 30 }));
    expect(mockUpdateErpMeta).toHaveBeenCalledWith(1, 'erp_completed');
  });

  it('rolling_order 类型更新授信字段', async () => {
    const formData = {
      creditType: 'rolling_order',
      customer: 100,
      rollingMaxOverdueDays: 15,
      rollingMaxOverdueOrders: 3,
    };
    await onApprovedCustomerCredit(mkInstance(), formData);
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      100,
      expect.objectContaining({ maxDebtDays: 15, maxDebtOrderNum: 3 }),
    );
  });

  it('hold_order 类型标记压单', async () => {
    const formData = {
      creditType: 'hold_order',
      customer: 100,
      holdSettlementOrders: [1, 2, 3],
      hoardType: 'long_term',
      _customerName: '客户A',
    };
    await onApprovedCustomerCredit(mkInstance(), formData);
    expect(mockMarkHold).toHaveBeenCalledWith([1, 2, 3], 100);
    expect(cache.invalidate).toHaveBeenCalled();
  });

  it('ERP 更新失败时标记 erp_failed 并抛出', async () => {
    mockUpdateProfile.mockRejectedValueOnce(new Error('ERP timeout'));
    const formData = { creditType: 'payment_period', customer: 100, maxOverdueDays: 30 };
    await expect(onApprovedCustomerCredit(mkInstance(), formData)).rejects.toThrow('ERP timeout');
    expect(mockMarkFailed).toHaveBeenCalledWith(1, expect.objectContaining({ error: 'ERP timeout' }));
  });

  it('有营业执照上传时调用 erpUploadBusinessLicense', async () => {
    (existsSync as jest.Mock).mockReturnValueOnce(true);
    const formData = {
      creditType: 'payment_period',
      customer: 100,
      maxOverdueDays: 30,
      businessLicensePhotos: [{ url: 'photo1.jpg' }],
    };
    await onApprovedCustomerCredit(mkInstance(), formData);
    expect(mockUploadLicense).toHaveBeenCalledWith(100, expect.any(Array), expect.any(Object));
  });

  it('营业执照延期时创建延期记录', async () => {
    const formData = {
      creditType: 'payment_period',
      customer: 100,
      maxOverdueDays: 30,
      _licenseDeferred: true,
      _customerName: '客户B',
    };
    await onApprovedCustomerCredit(mkInstance(), formData);
    expect(createDeferredUploadAfterApproval).toHaveBeenCalled();
  });
});
