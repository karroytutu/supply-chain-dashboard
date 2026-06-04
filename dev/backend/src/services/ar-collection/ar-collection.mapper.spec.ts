/**
 * 催收管理 DTO 映射器单元测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../utils/dateFormat', () => ({
  formatDateTime: (d: any) => (d ? new Date(d).toISOString() : null),
}));

jest.mock('../assessment/assessment.types', () => ({
  ASSESSMENT_STATUS_LABELS: { pending: '待处理', confirmed: '已处理' },
  ASSESSMENT_ROLE_LABELS: { procurement_manager: '采购主管', marketing_supervisor: '营销主管' },
}));

import {
  toTaskDTO,
  toDetailDTO,
  toActionDTO,
  fromExtensionDTO,
  fromDifferenceDTO,
  fromEscalateDTO,
  fromResolveDifferenceDTO,
  fromRollbackDTO,
} from './ar-collection.mapper';
import type { CollectionTask, CollectionDetail, CollectionAction } from './ar-collection.types';

// ==================== toTaskDTO ====================

describe('toTaskDTO', () => {
  it('null 输入返回 null', () => {
    expect(toTaskDTO(null)).toBeNull();
  });

  it('基本字段转换', () => {
    const task = {
      id: 1,
      task_no: 'T-001',
      consumer_name: '客户A',
      total_amount: '5000',
      max_overdue_days: 30,
      dynamic_max_overdue_days: null,
      status: 'collecting',
    } as unknown as CollectionTask;

    const dto = toTaskDTO(task);
    expect(dto!.id).toBe(1);
    expect(dto!.totalAmount).toBe(5000);
    expect(dto!.maxOverdueDays).toBe(30);
  });

  it('dynamic_max_overdue_days 优先', () => {
    const task = {
      id: 2, max_overdue_days: 30, dynamic_max_overdue_days: 45,
      total_amount: '0',
    } as unknown as CollectionTask;

    const dto = toTaskDTO(task);
    expect(dto!.maxOverdueDays).toBe(45);
  });

  it('关联字段默认值', () => {
    const task = {
      id: 3, total_amount: '100', max_overdue_days: 0,
    } as unknown as CollectionTask;

    const dto = toTaskDTO(task);
    expect(dto!.currentHandlerName).toBeNull();
    expect(dto!.managerName).toBeNull();
    expect(dto!.assessmentTiers).toEqual([]);
    expect(dto!.entryReasons).toEqual([]);
  });
});

// ==================== toDetailDTO ====================

describe('toDetailDTO', () => {
  it('null 输入返回 null', () => {
    expect(toDetailDTO(null)).toBeNull();
  });

  it('数值字段转换', () => {
    const detail = {
      id: 1,
      total_amount: '1000',
      left_amount: '800',
      overdue_days: 15,
      dynamic_overdue_days: null,
      process_amount: '200',
    } as unknown as CollectionDetail;

    const dto = toDetailDTO(detail);
    expect(dto!.totalAmount).toBe(1000);
    expect(dto!.leftAmount).toBe(800);
    expect(dto!.overdueDays).toBe(15);
    expect(dto!.processAmount).toBe(200);
  });

  it('dynamic_overdue_days 优先', () => {
    const detail = {
      id: 2, overdue_days: 10, dynamic_overdue_days: 20,
      total_amount: '0', left_amount: '0', process_amount: '0',
    } as unknown as CollectionDetail;

    const dto = toDetailDTO(detail);
    expect(dto!.overdueDays).toBe(20);
  });
});

// ==================== toActionDTO ====================

describe('toActionDTO', () => {
  it('null 输入返回 null', () => {
    expect(toActionDTO(null)).toBeNull();
  });

  it('键名转换', () => {
    const action = {
      id: 1, task_id: 5, action_type: 'extend', operator_name: '张三',
    } as unknown as CollectionAction;

    const dto = toActionDTO(action);
    expect(dto).toHaveProperty('id', 1);
    expect(dto).toHaveProperty('taskId', 5);
  });
});

// ==================== fromExtensionDTO ====================

describe('fromExtensionDTO', () => {
  it('camelCase → snake_case 转换', () => {
    const result = fromExtensionDTO(
      { detailIds: [1, 2], extensionDays: 15, evidenceFileId: 100, signatureData: 'url', reason: '需要时间' },
      5, 1, '张三'
    );

    expect(result.task_id).toBe(5);
    expect(result.detail_ids).toEqual([1, 2]);
    expect(result.extension_days).toBe(15);
    expect(result.evidence_file_id).toBe(100);
    expect(result.signature_url).toBe('url');
    expect(result.remark).toBe('需要时间');
    expect(result.operator_id).toBe(1);
    expect(result.operator_name).toBe('张三');
  });
});

// ==================== fromDifferenceDTO ====================

describe('fromDifferenceDTO', () => {
  it('正确转换', () => {
    const result = fromDifferenceDTO(
      { detailIds: [3, 4], remark: '差异说明' },
      10, 2, '李四'
    );

    expect(result.task_id).toBe(10);
    expect(result.detail_ids).toEqual([3, 4]);
    expect(result.remark).toBe('差异说明');
    expect(result.operator_id).toBe(2);
  });
});

// ==================== fromEscalateDTO ====================

describe('fromEscalateDTO', () => {
  it('正确转换', () => {
    const result = fromEscalateDTO(
      { targetLevel: 'level_2' as any, reason: '升级原因' },
      15, 3, '王五'
    );

    expect(result.task_id).toBe(15);
    expect(result.detail_ids).toEqual([]);
    expect(result.target_level).toBe('level_2');
    expect(result.reason).toBe('升级原因');
  });
});

// ==================== fromResolveDifferenceDTO ====================

describe('fromResolveDifferenceDTO', () => {
  it('正确转换', () => {
    const result = fromResolveDifferenceDTO(
      { detailIds: [5], remark: '已解决' },
      20, 4, '赵六'
    );

    expect(result.task_id).toBe(20);
    expect(result.detail_ids).toEqual([5]);
    expect(result.remark).toBe('已解决');
  });
});

// ==================== fromRollbackDTO ====================

describe('fromRollbackDTO', () => {
  it('正确转换', () => {
    const result = fromRollbackDTO(
      { reason: '退回原因' },
      25, 5, '钱七'
    );

    expect(result.task_id).toBe(25);
    expect(result.reason).toBe('退回原因');
    expect(result.operator_id).toBe(5);
  });
});
