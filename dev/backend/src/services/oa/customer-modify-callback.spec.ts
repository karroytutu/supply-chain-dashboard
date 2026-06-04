/**
 * 客户档案修改回调单元测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../auth.service', () => ({
  getUserRolesAndPermissions: jest.fn(),
}));

jest.mock('../erp-client/erp-customer.service', () => ({
  getErpCustomerProfile: jest.fn(),
  getCustomerDebtTotal: jest.fn().mockResolvedValue(0),
}));

jest.mock('../erp-client/erp-customer-update.service', () => ({
  erpUpdateCustomerFields: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../erp-client/erp-image-upload', () => ({
  erpUploadImageToErp: jest.fn().mockResolvedValue('img-123'),
}));

jest.mock('../erp-client/erp-customer-reference.service', () => ({
  getErpGrades: jest.fn().mockResolvedValue([]),
  getErpGroups: jest.fn().mockResolvedValue([]),
  getErpAreas: jest.fn().mockResolvedValue([]),
}));

jest.mock('../fixed-asset/erp-meta-utils', () => ({
  updateErpMetaStatus: jest.fn().mockResolvedValue(undefined),
  markErpFailed: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../fixed-asset/fixed-asset.query', () => ({
  getErpStaff: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../middleware/credit-upload', () => ({
  resolveLicenseFilePath: jest.fn((url: string) => `/tmp/${url}`),
}));

jest.mock('../../utils/constants', () => ({
  CUSTOMER_MODIFY_ALLOWED_ROLES: ['admin', 'marketer', 'marketing_manager'],
  CUSTOMER_STATE_DISABLED: 0,
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
import { getErpCustomerProfile, getCustomerDebtTotal } from '../erp-client/erp-customer.service';
import { erpUpdateCustomerFields } from '../erp-client/erp-customer-update.service';
import { erpUploadImageToErp } from '../erp-client/erp-image-upload';
import { getErpGrades, getErpGroups, getErpAreas } from '../erp-client/erp-customer-reference.service';
import { updateErpMetaStatus, markErpFailed } from '../fixed-asset/erp-meta-utils';
import { getErpStaff } from '../fixed-asset/fixed-asset.query';
import {
  beforeSubmitCustomerModify,
  onApprovedCustomerModify,
} from './customer-modify-callback';

const mockGetRoles = getUserRolesAndPermissions as jest.MockedFunction<typeof getUserRolesAndPermissions>;
const mockGetProfile = getErpCustomerProfile as jest.MockedFunction<typeof getErpCustomerProfile>;
const mockGetDebt = getCustomerDebtTotal as jest.MockedFunction<typeof getCustomerDebtTotal>;
const mockUpdateFields = erpUpdateCustomerFields as jest.MockedFunction<typeof erpUpdateCustomerFields>;
const mockUpdateMeta = updateErpMetaStatus as jest.MockedFunction<typeof updateErpMetaStatus>;
const mockMarkFailed = markErpFailed as jest.MockedFunction<typeof markErpFailed>;

const mkInstance = (overrides: any = {}) => ({
  id: 1,
  instance_no: 'OA-002',
  title: '客户修改',
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

describe('beforeSubmitCustomerModify', () => {
  it('无权限角色时抛出异常', async () => {
    mockGetRoles.mockResolvedValueOnce({ roles: [{ code: 'viewer' }] } as any);
    await expect(beforeSubmitCustomerModify({ customer: 100 }, 1)).rejects.toThrow('当前用户无权提交客户档案修改申请');
  });

  it('admin 角色可以提交', async () => {
    mockGetRoles.mockResolvedValueOnce({ roles: [{ code: 'admin' }] } as any);
    const result = await beforeSubmitCustomerModify({ customer: 100 }, 1);
    expect(result).toBeDefined();
  });

  it('客户名称缺失时从 ERP 补全', async () => {
    mockGetRoles.mockResolvedValueOnce({ roles: [{ code: 'admin' }] } as any);
    mockGetProfile.mockResolvedValueOnce({ name: 'ERP客户名' } as any);
    const result = await beforeSubmitCustomerModify({ customer: 100 }, 1);
    expect(result._customerName).toBe('ERP客户名');
  });

  it('ERP 不可用时不阻塞提交', async () => {
    mockGetRoles.mockResolvedValueOnce({ roles: [{ code: 'marketer' }] } as any);
    mockGetProfile.mockRejectedValueOnce(new Error('ERP down'));
    const result = await beforeSubmitCustomerModify({ customer: 100 }, 1);
    expect(result).toBeDefined();
  });

  it('捕获原始值用于变更对比', async () => {
    mockGetRoles.mockResolvedValueOnce({ roles: [{ code: 'admin' }] } as any);
    mockGetProfile.mockResolvedValueOnce({
      name: '原客户名',
      contactName: '原联系人',
      contactTel: '123456',
      state: 1,
      groupId: 10,
    } as any);
    (getErpGroups as jest.Mock).mockResolvedValueOnce([{ id: 10, name: '渠道A' }]);
    const result = await beforeSubmitCustomerModify({ customer: 100 }, 1);
    expect(result._original_customerName).toBe('原客户名');
    expect(result._original_contactName).toBe('原联系人');
  });
});

describe('onApprovedCustomerModify', () => {
  it('基本文本字段更新', async () => {
    const formData = {
      customer: 100,
      customerName: '新客户名',
      contactName: '新联系人',
      contactTel: '999999',
    };
    await onApprovedCustomerModify(mkInstance(), formData);
    expect(mockUpdateMeta).toHaveBeenCalledWith(1, 'processing');
    expect(mockUpdateFields).toHaveBeenCalledWith(100, expect.objectContaining({
      name: '新客户名',
      contactName: '新联系人',
      contactTel: '999999',
    }));
    expect(mockUpdateMeta).toHaveBeenCalledWith(1, 'erp_completed');
  });

  it('停用客户时有新欠款则失败', async () => {
    mockGetDebt.mockResolvedValueOnce(500);
    const formData = { customer: 100, customerState: 0 };
    await expect(onApprovedCustomerModify(mkInstance(), formData)).rejects.toThrow('审批期间客户产生新欠款');
    expect(mockMarkFailed).toHaveBeenCalled();
  });

  it('停用客户时无欠款则成功', async () => {
    mockGetDebt.mockResolvedValueOnce(0);
    const formData = { customer: 100, customerState: 0 };
    await onApprovedCustomerModify(mkInstance(), formData);
    expect(mockUpdateFields).toHaveBeenCalledWith(100, expect.objectContaining({ state: 0 }));
  });

  it('等级更新时同步 gradeName', async () => {
    (getErpGrades as jest.Mock).mockResolvedValueOnce([{ id: 5, name: 'VIP' }]);
    const formData = { customer: 100, gradeId: 5 };
    await onApprovedCustomerModify(mkInstance(), formData);
    expect(mockUpdateFields).toHaveBeenCalledWith(100, expect.objectContaining({
      gradeId: 5,
      gradeName: 'VIP',
    }));
  });

  it('渠道更新时同步 groupName', async () => {
    (getErpGroups as jest.Mock).mockResolvedValueOnce([{ id: 10, name: '渠道A' }]);
    const formData = { customer: 100, groupId: 10 };
    await onApprovedCustomerModify(mkInstance(), formData);
    expect(mockUpdateFields).toHaveBeenCalledWith(100, expect.objectContaining({
      groupId: 10,
      groupName: '渠道A',
    }));
  });

  it('片区更新时同步 areaName', async () => {
    (getErpAreas as jest.Mock).mockResolvedValueOnce([{ id: 3, name: '华东' }]);
    const formData = { customer: 100, areaId: 3 };
    await onApprovedCustomerModify(mkInstance(), formData);
    expect(mockUpdateFields).toHaveBeenCalledWith(100, expect.objectContaining({
      areaId: 3,
      areaName: '华东',
    }));
  });

  it('所属营销更新 - 使用隐藏字段名称', async () => {
    const formData = { customer: 100, consumerManagerId: 20, _consumerManagerName: '李经理' };
    await onApprovedCustomerModify(mkInstance(), formData);
    expect(mockUpdateFields).toHaveBeenCalledWith(100, expect.objectContaining({
      consumerManagerId: 20,
      consumerManagerName: '李经理',
    }));
  });

  it('所属营销更新 - 兜底从 ERP staff 解析名称', async () => {
    (getErpStaff as jest.Mock).mockResolvedValueOnce([{ id: 20, name: '王经理' }]);
    const formData = { customer: 100, consumerManagerId: 20 };
    await onApprovedCustomerModify(mkInstance(), formData);
    expect(mockUpdateFields).toHaveBeenCalledWith(100, expect.objectContaining({
      consumerManagerId: 20,
      consumerManagerName: '王经理',
    }));
  });

  it('ERP 更新失败时标记 erp_failed 并抛出', async () => {
    mockUpdateFields.mockRejectedValueOnce(new Error('ERP error'));
    const formData = { customer: 100, customerName: 'test' };
    await expect(onApprovedCustomerModify(mkInstance(), formData)).rejects.toThrow('ERP error');
    expect(mockMarkFailed).toHaveBeenCalledWith(1, expect.objectContaining({ error: 'ERP error' }));
  });

  it('门头照上传 - 文件存在时上传', async () => {
    const fsMod = require('fs');
    fsMod.existsSync.mockReturnValueOnce(true);
    (erpUploadImageToErp as jest.Mock).mockResolvedValueOnce('img-456');
    const formData = { customer: 100, storefrontPhoto: [{ url: 'store.jpg' }] };
    await onApprovedCustomerModify(mkInstance(), formData);
    expect(erpUploadImageToErp).toHaveBeenCalled();
    expect(mockUpdateFields).toHaveBeenCalledWith(100, expect.objectContaining({ picture: 'img-456' }));
  });
});
