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

const mockRunCalculation = jest.fn();
jest.mock('../assessment/assessment-calculate', () => ({
  runCalculation: mockRunCalculation,
}));

const mockSendAssessmentNotifications = jest.fn().mockResolvedValue(undefined);
jest.mock('../assessment/assessment-notify', () => ({
  sendAssessmentNotifications: mockSendAssessmentNotifications,
}));

const mockGetRecords = jest.fn();
jest.mock('../assessment/assessment.repository', () => ({
  getRecords: mockGetRecords,
}));

import { runCollectionPipeline } from './collection-pipeline.task';

describe('runCollectionPipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckHoldMetaExpiry.mockResolvedValue([]);
    mockGenerateCollectionOaInstances.mockResolvedValue(undefined);
    mockRunCalculation.mockResolvedValue({ totalRecords: 0, newRecords: 0 });
    mockSendAssessmentNotifications.mockResolvedValue(undefined);
    mockGetRecords.mockResolvedValue({ rows: [] });
  });

  it('正常流程：前置清理 + 2 个步骤按序调用', async () => {
    const callOrder: string[] = [];
    mockCheckHoldMetaExpiry.mockImplementation(async () => { callOrder.push('expiry'); });
    mockGenerateCollectionOaInstances.mockImplementation(async () => { callOrder.push('generate'); });
    mockRunCalculation.mockImplementation(async () => {
      callOrder.push('assess');
      return { totalRecords: 5, newRecords: 0 };
    });

    await runCollectionPipeline();

    expect(callOrder).toEqual(['expiry', 'generate', 'assess']);
    expect(mockCheckHoldMetaExpiry).toHaveBeenCalledTimes(1);
    expect(mockGenerateCollectionOaInstances).toHaveBeenCalledTimes(1);
    expect(mockRunCalculation).toHaveBeenCalledWith({
      triggered_by: 'scheduled',
      category: 'oa_collection',
    });
  });

  it('前置清理失败时 Step 1、2 仍执行', async () => {
    mockCheckHoldMetaExpiry.mockRejectedValue(new Error('数据库连接失败'));
    mockRunCalculation.mockResolvedValue({ totalRecords: 0, newRecords: 0 });

    await runCollectionPipeline();

    expect(mockCheckHoldMetaExpiry).toHaveBeenCalledTimes(1);
    expect(mockGenerateCollectionOaInstances).toHaveBeenCalledTimes(1);
    expect(mockRunCalculation).toHaveBeenCalledTimes(1);
  });

  it('Step 1 失败时 Step 2 仍执行', async () => {
    mockGenerateCollectionOaInstances.mockRejectedValue(new Error('Advisory lock 获取失败'));
    mockRunCalculation.mockResolvedValue({ totalRecords: 0, newRecords: 0 });

    await runCollectionPipeline();

    expect(mockCheckHoldMetaExpiry).toHaveBeenCalledTimes(1);
    expect(mockGenerateCollectionOaInstances).toHaveBeenCalledTimes(1);
    expect(mockRunCalculation).toHaveBeenCalledTimes(1);
  });

  it('Step 2 考核有新增记录时发送通知', async () => {
    mockRunCalculation.mockResolvedValue({ totalRecords: 10, newRecords: 3 });
    mockGetRecords.mockResolvedValue({
      rows: [{ id: 1 }, { id: 2 }, { id: 3 }],
    });

    await runCollectionPipeline();

    expect(mockGetRecords).toHaveBeenCalledWith({
      category: 'oa_collection',
      status: 'pending',
      page: 1,
      page_size: 1000,
    });
    expect(mockSendAssessmentNotifications).toHaveBeenCalledTimes(1);
    expect(mockSendAssessmentNotifications).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  it('Step 2 考核无新增记录时不发送通知', async () => {
    mockRunCalculation.mockResolvedValue({ totalRecords: 10, newRecords: 0 });

    await runCollectionPipeline();

    expect(mockGetRecords).not.toHaveBeenCalled();
    expect(mockSendAssessmentNotifications).not.toHaveBeenCalled();
  });

  it('Step 2 考核计算失败时不抛出异常', async () => {
    mockRunCalculation.mockRejectedValue(new Error('数据库查询失败'));

    // 不应抛出
    await expect(runCollectionPipeline()).resolves.toBeUndefined();
  });

  it('所有步骤都失败时不抛出异常', async () => {
    mockCheckHoldMetaExpiry.mockRejectedValue(new Error('expiry failed'));
    mockGenerateCollectionOaInstances.mockRejectedValue(new Error('generate failed'));
    mockRunCalculation.mockRejectedValue(new Error('assess failed'));

    await expect(runCollectionPipeline()).resolves.toBeUndefined();

    // 三步都尝试执行了
    expect(mockCheckHoldMetaExpiry).toHaveBeenCalledTimes(1);
    expect(mockGenerateCollectionOaInstances).toHaveBeenCalledTimes(1);
    expect(mockRunCalculation).toHaveBeenCalledTimes(1);
  });
});
