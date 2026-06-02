/**
 * oa-process-centre 单元测试
 * 测试壳实例创建、模板缓存、待办 CRUD、批量取消等核心逻辑
 *
 * Mock 策略：
 * - dingtalk-process-centre.service: mock 所有钉钉 API 调用
 * - db/appPool: mock 数据库查询
 * - config: mock 配置
 */

// =====================================================
// Mocks
// =====================================================

jest.mock('../../db/appPool', () => ({
  appQuery: jest.fn(),
}));

jest.mock('../../config', () => ({
  config: {
    app: { baseUrl: 'https://test.example.com' },
    dingtalk: { agentId: '12345' },
  },
}));

jest.mock('../dingtalk-process-centre.service', () => ({
  saveProcessTemplate: jest.fn(),
  createWorkrecordInstance: jest.fn(),
  createPcTasks: jest.fn(),
  updatePcTaskStatus: jest.fn(),
  cancelPcTasks: jest.fn(),
  updateWorkrecordStatus: jest.fn(),
}));

jest.mock('./oa-form-summary', () => ({
  extractFormSummary: jest.fn().mockReturnValue([
    { key: '金额', value: '¥10,000' },
    { key: '收款方', value: '张三' },
  ]),
}));

import { appQuery } from '../../db/appPool';
import {
  saveProcessTemplate,
  createWorkrecordInstance,
  createPcTasks,
  updatePcTaskStatus,
  cancelPcTasks,
  updateWorkrecordStatus,
} from '../dingtalk-process-centre.service';
import {
  createProcessInstance,
  createApprovalTodo,
  completeApprovalTodo,
  completeAllPendingTodos,
  finalizeProcessInstance,
  _clearProcessCodeCache,
} from './oa-process-centre';

const mockAppQuery = appQuery as jest.MockedFunction<typeof appQuery>;
const mockSaveTemplate = saveProcessTemplate as jest.MockedFunction<typeof saveProcessTemplate>;
const mockCreateInstance = createWorkrecordInstance as jest.MockedFunction<typeof createWorkrecordInstance>;
const mockCreatePcTasks = createPcTasks as jest.MockedFunction<typeof createPcTasks>;
const mockUpdatePcTaskStatus = updatePcTaskStatus as jest.MockedFunction<typeof updatePcTaskStatus>;
const mockCancelPcTasks = cancelPcTasks as jest.MockedFunction<typeof cancelPcTasks>;
const mockUpdateWorkrecordStatus = updateWorkrecordStatus as jest.MockedFunction<typeof updateWorkrecordStatus>;

// =====================================================
// 辅助
// =====================================================

function mockQueryOnce(rows: any[]) {
  mockAppQuery.mockResolvedValueOnce({ rows, rowCount: rows.length } as any);
}

function mockQueryMultiple(...rowSets: any[][]) {
  for (const rows of rowSets) {
    mockAppQuery.mockResolvedValueOnce({ rows, rowCount: rows.length } as any);
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  _clearProcessCodeCache();
});

// =====================================================
// createProcessInstance
// =====================================================

describe('createProcessInstance', () => {
  const baseParams = {
    instanceId: 100,
    formTypeCode: 'other_payment',
    formTypeName: '其他付款申请',
    applicantUserId: 1,
    title: '测试付款',
  };

  it('首次创建：自动创建模板 + 壳实例 + 存储映射', async () => {
    // L2 DB 查询：无缓存
    mockQueryOnce([]);
    // 模板创建 + DB 保存
    mockSaveTemplate.mockResolvedValueOnce('PROC-TEST-001');
    mockQueryOnce([]); // INSERT oa_process_template_mapping
    // 获取用户 dingtalk_user_id
    mockQueryOnce([{ dingtalk_user_id: 'dt_user_001' }]);
    // 壳实例创建
    mockCreateInstance.mockResolvedValueOnce('pi_test_001');
    // INSERT oa_process_instance_mapping
    mockQueryOnce([]);

    await createProcessInstance(
      baseParams.instanceId,
      baseParams.formTypeCode,
      baseParams.formTypeName,
      baseParams.applicantUserId,
      baseParams.title,
    );

    expect(mockSaveTemplate).toHaveBeenCalledWith(
      '供应链OA-其他付款申请',
      expect.arrayContaining([expect.objectContaining({ componentType: 'TextField' })]),
      'https://test.example.com/oa/detail'
    );
    expect(mockCreateInstance).toHaveBeenCalledWith(
      'PROC-TEST-001',
      'dt_user_001',
      expect.any(Array),
      'https://test.example.com/oa/detail/100'
    );
  });

  it('模板已缓存：跳过模板创建', async () => {
    // L2 DB 查询：命中缓存
    mockQueryOnce([{ dingtalk_process_code: 'PROC-CACHED' }]);
    // 获取用户 dingtalk_user_id
    mockQueryOnce([{ dingtalk_user_id: 'dt_user_001' }]);
    // 壳实例创建
    mockCreateInstance.mockResolvedValueOnce('pi_cached');
    // INSERT oa_process_instance_mapping
    mockQueryOnce([]);

    await createProcessInstance(
      200,
      'other_payment',
      '其他付款申请',
      1,
      '缓存测试',
    );

    expect(mockSaveTemplate).not.toHaveBeenCalled();
  });

  it('用户无 dingtalk_user_id：记录 failed 状态', async () => {
    mockQueryOnce([{ dingtalk_process_code: 'PROC-001' }]);
    mockQueryOnce([]); // 用户无 dingtalk_user_id → 返回空
    // INSERT failed mapping
    mockQueryOnce([]);

    await createProcessInstance(300, 'other_payment', '其他付款申请', 99, '无钉钉用户');

    expect(mockCreateInstance).not.toHaveBeenCalled();
    expect(mockAppQuery).toHaveBeenCalledWith(
      expect.stringContaining("status = 'failed'"),
      expect.any(Array)
    );
  });

  it('壳实例创建失败：不抛异常，记录 failed', async () => {
    mockQueryOnce([{ dingtalk_process_code: 'PROC-001' }]);
    mockQueryOnce([{ dingtalk_user_id: 'dt_user_001' }]);
    mockCreateInstance.mockRejectedValueOnce(new Error('API timeout'));
    // INSERT failed mapping
    mockQueryOnce([]);

    await expect(
      createProcessInstance(400, 'other_payment', '其他付款申请', 1, '失败测试')
    ).resolves.toBeUndefined();
  });
});

// =====================================================
// createApprovalTodo
// =====================================================

describe('createApprovalTodo', () => {
  it('正常创建：查壳实例 → 获取userId → 创建待办 → 存映射', async () => {
    // getActiveInstanceMapping
    mockQueryOnce([{ dingtalk_process_instance_id: 'pi_001' }]);
    // getDingtalkUserId
    mockQueryOnce([{ dingtalk_user_id: 'dt_approver_001' }]);
    // createPcTasks
    mockCreatePcTasks.mockResolvedValueOnce([12345]);
    // INSERT oa_process_task_mapping
    mockQueryOnce([]);

    await createApprovalTodo(
      100, 'OA-001', '测试付款', '其他付款申请', '张三',
      2, undefined, undefined, 1
    );

    expect(mockCreatePcTasks).toHaveBeenCalledWith(
      'pi_001',
      '100:node1',
      [{ userId: 'dt_approver_001', url: 'https://test.example.com/oa/detail/100' }]
    );
  });

  it('无壳实例：跳过待办创建', async () => {
    mockQueryOnce([]); // getActiveInstanceMapping 返回空

    await createApprovalTodo(100, 'OA-001', '测试', '测试', '张三', 2);

    expect(mockCreatePcTasks).not.toHaveBeenCalled();
  });

  it('审批人无 dingtalk_user_id：跳过', async () => {
    mockQueryOnce([{ dingtalk_process_instance_id: 'pi_001' }]);
    mockQueryOnce([]); // 无 dingtalk_user_id

    await createApprovalTodo(100, 'OA-001', '测试', '测试', '张三', 2);

    expect(mockCreatePcTasks).not.toHaveBeenCalled();
  });

  it('待办创建失败：不抛异常', async () => {
    mockQueryOnce([{ dingtalk_process_instance_id: 'pi_001' }]);
    mockQueryOnce([{ dingtalk_user_id: 'dt_approver_001' }]);
    mockCreatePcTasks.mockRejectedValueOnce(new Error('API error'));
    // INSERT failed mapping
    mockQueryOnce([]);

    await expect(
      createApprovalTodo(100, 'OA-001', '测试', '测试', '张三', 2)
    ).resolves.toBeUndefined();
  });
});

// =====================================================
// completeApprovalTodo
// =====================================================

describe('completeApprovalTodo', () => {
  it('正常完成：查壳实例 → 查待办 → 更新状态', async () => {
    // getActiveInstanceMapping
    mockQueryOnce([{ dingtalk_process_instance_id: 'pi_001' }]);
    // 查 pending 待办
    mockQueryOnce([{ pc_task_id: 12345 }]);
    // updatePcTaskStatus
    mockUpdatePcTaskStatus.mockResolvedValueOnce(undefined);
    // UPDATE oa_process_task_mapping
    mockQueryOnce([]);

    await completeApprovalTodo(100, 2, 'AGREE');

    expect(mockUpdatePcTaskStatus).toHaveBeenCalledWith('pi_001', [
      { taskId: 12345, status: 'COMPLETED', result: 'AGREE' },
    ]);
  });

  it('无待办记录：直接返回', async () => {
    mockQueryOnce([{ dingtalk_process_instance_id: 'pi_001' }]);
    mockQueryOnce([]); // 无 pending 待办

    await completeApprovalTodo(100, 2);

    expect(mockUpdatePcTaskStatus).not.toHaveBeenCalled();
  });
});

// =====================================================
// completeAllPendingTodos
// =====================================================

describe('completeAllPendingTodos', () => {
  it('正常批量取消：查壳实例 → 查 activityId → 取消 → 更新壳实例', async () => {
    // getActiveInstanceMapping
    mockQueryOnce([{ dingtalk_process_instance_id: 'pi_001' }]);
    // 查 activityIds
    mockQueryOnce([{ activity_id: '100:node1' }, { activity_id: '100:node2' }]);
    // cancelPcTasks
    mockCancelPcTasks.mockResolvedValueOnce(undefined);
    // UPDATE oa_process_task_mapping
    mockQueryOnce([]);
    // UPDATE oa_process_instance_mapping（幂等保护，需返回 rowCount=1）
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
    // updateWorkrecordStatus
    mockUpdateWorkrecordStatus.mockResolvedValueOnce(undefined);

    await completeAllPendingTodos(100, 'refuse');

    expect(mockCancelPcTasks).toHaveBeenCalledWith('pi_001', '100:node1', ['100:node2']);
    expect(mockUpdateWorkrecordStatus).toHaveBeenCalledWith('pi_001', 'TERMINATED', 'refuse');
  });

  it('壳实例已被其他路径终结：不调用钉钉 API', async () => {
    mockQueryOnce([{ dingtalk_process_instance_id: 'pi_001' }]);
    mockQueryOnce([{ activity_id: '100:node1' }]);
    mockCancelPcTasks.mockResolvedValueOnce(undefined);
    mockQueryOnce([]); // UPDATE oa_process_task_mapping
    // UPDATE oa_process_instance_mapping 返回 rowCount=0（已被终结）
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    await completeAllPendingTodos(100, 'refuse');

    expect(mockUpdateWorkrecordStatus).not.toHaveBeenCalled();
  });

  it('无壳实例：跳过', async () => {
    mockQueryOnce([]); // getActiveInstanceMapping 返回空

    await completeAllPendingTodos(100, 'refuse');

    expect(mockCancelPcTasks).not.toHaveBeenCalled();
  });
});

// =====================================================
// finalizeProcessInstance
// =====================================================

describe('finalizeProcessInstance', () => {
  it('正常完成壳实例 (agree)', async () => {
    mockQueryOnce([{ dingtalk_process_instance_id: 'pi_001' }]);
    // UPDATE oa_process_instance_mapping（幂等保护，需返回 rowCount=1）
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
    mockUpdateWorkrecordStatus.mockResolvedValueOnce(undefined);

    await finalizeProcessInstance(100, 'agree');

    expect(mockUpdateWorkrecordStatus).toHaveBeenCalledWith('pi_001', 'COMPLETED', 'agree');
  });

  it('拒绝场景：传递 TERMINATED 状态', async () => {
    mockQueryOnce([{ dingtalk_process_instance_id: 'pi_001' }]);
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
    mockUpdateWorkrecordStatus.mockResolvedValueOnce(undefined);

    await finalizeProcessInstance(100, 'refuse');

    expect(mockUpdateWorkrecordStatus).toHaveBeenCalledWith('pi_001', 'TERMINATED', 'refuse');
  });

  it('壳实例已被其他路径终结：不调用钉钉 API', async () => {
    mockQueryOnce([{ dingtalk_process_instance_id: 'pi_001' }]);
    // UPDATE 返回 rowCount=0（已被终结）
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    await finalizeProcessInstance(100, 'agree');

    expect(mockUpdateWorkrecordStatus).not.toHaveBeenCalled();
  });

  it('无壳实例：跳过', async () => {
    mockQueryOnce([]); // getActiveInstanceMapping 返回空

    await finalizeProcessInstance(100, 'agree');

    expect(mockUpdateWorkrecordStatus).not.toHaveBeenCalled();
  });

  it('API 失败：不抛异常', async () => {
    mockQueryOnce([{ dingtalk_process_instance_id: 'pi_001' }]);
    mockAppQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);
    mockUpdateWorkrecordStatus.mockRejectedValueOnce(new Error('API error'));

    await expect(finalizeProcessInstance(100, 'agree')).resolves.toBeUndefined();
  });
});
