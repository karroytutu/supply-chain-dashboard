/**
 * 催收统一流水线 编排层测试
 * @module services/scheduler/collection-pipeline.task.spec
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

const mockCheckHoldMetaExpiry = jest.fn().mockResolvedValue([]);
jest.mock('../erp-debt/ar-hold-meta.service', () => ({
  checkHoldMetaExpiry: mockCheckHoldMetaExpiry,
}));

const mockGenerateCollectionOaInstances = jest.fn().mockResolvedValue(undefined);
jest.mock('../oa/ar-collection-creator', () => ({
  generateCollectionOaInstances: mockGenerateCollectionOaInstances,
}));

const mockAutoVerifySettledInstances = jest.fn().mockResolvedValue({ checked: 0, closed: 0, updated: 0 });
jest.mock('../oa/ar-collection-auto-verify', () => ({
  autoVerifySettledInstances: mockAutoVerifySettledInstances,
}));

import { runCollectionPipeline } from './collection-pipeline.task';

describe('runCollectionPipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckHoldMetaExpiry.mockResolvedValue([]);
    mockGenerateCollectionOaInstances.mockResolvedValue(undefined);
    mockAutoVerifySettledInstances.mockResolvedValue({ checked: 0, closed: 0, updated: 0 });
  });

  it('正常流程：前置清理 + 2 个步骤按序调用', async () => {
    const callOrder: string[] = [];
    mockCheckHoldMetaExpiry.mockImplementation(async () => { callOrder.push('expiry'); });
    mockGenerateCollectionOaInstances.mockImplementation(async () => { callOrder.push('generate'); });
    mockAutoVerifySettledInstances.mockImplementation(async () => { callOrder.push('verify'); });

    await runCollectionPipeline();

    expect(callOrder).toEqual(['expiry', 'generate', 'verify']);
    expect(mockCheckHoldMetaExpiry).toHaveBeenCalledTimes(1);
    expect(mockGenerateCollectionOaInstances).toHaveBeenCalledTimes(1);
    expect(mockAutoVerifySettledInstances).toHaveBeenCalledTimes(1);
  });

  it('前置清理失败时 Step 1、2 仍执行', async () => {
    mockCheckHoldMetaExpiry.mockRejectedValue(new Error('数据库连接失败'));

    await runCollectionPipeline();

    expect(mockCheckHoldMetaExpiry).toHaveBeenCalledTimes(1);
    expect(mockGenerateCollectionOaInstances).toHaveBeenCalledTimes(1);
    expect(mockAutoVerifySettledInstances).toHaveBeenCalledTimes(1);
  });

  it('Step 1 失败时 Step 2 仍执行', async () => {
    mockGenerateCollectionOaInstances.mockRejectedValue(new Error('Advisory lock 获取失败'));

    await runCollectionPipeline();

    expect(mockCheckHoldMetaExpiry).toHaveBeenCalledTimes(1);
    expect(mockGenerateCollectionOaInstances).toHaveBeenCalledTimes(1);
    expect(mockAutoVerifySettledInstances).toHaveBeenCalledTimes(1);
  });

  it('所有步骤都失败时不抛出异常', async () => {
    mockCheckHoldMetaExpiry.mockRejectedValue(new Error('expiry failed'));
    mockGenerateCollectionOaInstances.mockRejectedValue(new Error('generate failed'));
    mockAutoVerifySettledInstances.mockRejectedValue(new Error('verify failed'));

    await expect(runCollectionPipeline()).resolves.toBeUndefined();

    expect(mockCheckHoldMetaExpiry).toHaveBeenCalledTimes(1);
    expect(mockGenerateCollectionOaInstances).toHaveBeenCalledTimes(1);
    expect(mockAutoVerifySettledInstances).toHaveBeenCalledTimes(1);
  });
});
