/**
 * 客户授信营业执照后补上传 - 业务服务层单元测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('./credit-license.repository', () => ({
  getByInstanceId: jest.fn(),
  create: jest.fn(),
  updateStatus: jest.fn(),
}));

jest.mock('../erp-client/erp-credit-update.service', () => ({
  erpUploadBusinessLicense: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/constants', () => ({
  CREDIT_LICENSE_DEFERRED_DEADLINE_DAYS: 30,
}));

jest.mock('../assessment/assessment.repository', () => ({
  cancelPendingBySource: jest.fn().mockResolvedValue(undefined),
}));

import * as repository from './credit-license.repository';
import { erpUploadBusinessLicense } from '../erp-client/erp-credit-update.service';
import { cancelPendingBySource } from '../assessment/assessment.repository';
import {
  createDeferredUploadAfterApproval,
  supplementLicense,
} from './credit-license.service';

beforeEach(() => {
  jest.resetAllMocks();
});

describe('createDeferredUploadAfterApproval', () => {
  it('成功创建延期补交记录', async () => {
    (repository.getByInstanceId as jest.Mock).mockResolvedValueOnce(null);
    (repository.create as jest.Mock).mockResolvedValueOnce({
      id: 1,
      oa_instance_id: 100,
      customer_id: 1,
      customer_name: '测试客户',
      status: 'pending',
      deadline: new Date(),
    });

    const result = await createDeferredUploadAfterApproval(100, 1, '测试客户', 5, '张三');
    expect(result).toBeDefined();
    expect(result.oaInstanceId).toBe(100);
    expect(repository.create).toHaveBeenCalled();
  });

  it('已有记录时幂等返回', async () => {
    const existing = {
      id: 1,
      oa_instance_id: 100,
      customer_id: 1,
      customer_name: '测试客户',
      status: 'pending',
      deadline: new Date(),
    };
    (repository.getByInstanceId as jest.Mock).mockResolvedValueOnce(existing);

    const result = await createDeferredUploadAfterApproval(100, 1, '测试客户', 5, '张三');
    expect(result).toBeDefined();
    expect(repository.create).not.toHaveBeenCalled();
  });
});

describe('supplementLicense', () => {
  it('成功补交营业执照', async () => {
    const deferred = {
      id: 1,
      oa_instance_id: 100,
      customer_id: 1,
      status: 'pending',
      deadline: new Date(),
    };
    (repository.getByInstanceId as jest.Mock).mockResolvedValueOnce(deferred);
    (repository.updateStatus as jest.Mock).mockResolvedValueOnce({
      ...deferred,
      status: 'completed',
    });

    const result = await supplementLicense(100, ['/uploads/license.jpg'], 1);
    expect(result).toBeDefined();
    expect(erpUploadBusinessLicense).toHaveBeenCalledWith(1, ['/uploads/license.jpg']);
    expect(repository.updateStatus).toHaveBeenCalledWith(
      1, 'completed', expect.objectContaining({ completed_at: expect.any(String) })
    );
    expect(cancelPendingBySource).toHaveBeenCalledWith(1, 'credit_license_deferred');
  });

  it('未找到延期记录时抛出异常', async () => {
    (repository.getByInstanceId as jest.Mock).mockResolvedValueOnce(null);

    await expect(supplementLicense(100, [], 1)).rejects.toThrow('未找到该审批的延期补交记录');
  });

  it('已完成时抛出异常', async () => {
    (repository.getByInstanceId as jest.Mock).mockResolvedValueOnce({
      id: 1, status: 'completed',
    });

    await expect(supplementLicense(100, [], 1)).rejects.toThrow('已补交');
  });

  it('无文件时跳过 ERP 上传', async () => {
    const deferred = { id: 1, status: 'pending', oa_instance_id: 100 };
    (repository.getByInstanceId as jest.Mock).mockResolvedValueOnce(deferred);
    (repository.updateStatus as jest.Mock).mockResolvedValueOnce({ ...deferred, status: 'completed' });

    await supplementLicense(100, [], 1);
    expect(erpUploadBusinessLicense).not.toHaveBeenCalled();
  });
});
