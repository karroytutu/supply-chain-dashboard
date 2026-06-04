/**
 * 营业执照延期上传 DTO 映射器测试
 */

jest.mock('../../utils/logger', () => ({
  createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }),
}));

jest.mock('../../utils/constants', () => ({
  CREDIT_LICENSE_PENALTY_PER_DAY: 50,
}));

import { toDTO, toDTOList } from './credit-license.mapper';
import type { CreditLicenseDeferredRow } from './credit-license.types';

function createRow(overrides: Partial<CreditLicenseDeferredRow> = {}): CreditLicenseDeferredRow {
  return {
    id: 1,
    oa_instance_id: 100,
    customer_id: 1,
    customer_name: '测试客户',
    applicant_id: 5,
    applicant_name: '张三',
    status: 'pending',
    deadline: '2026-12-01T00:00:00Z',
    last_reminder_at: null,
    completed_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('toDTO', () => {
  it('基本字段映射', () => {
    const row = createRow();
    const dto = toDTO(row);

    expect(dto.id).toBe(1);
    expect(dto.oaInstanceId).toBe(100);
    expect(dto.customerId).toBe(1);
    expect(dto.customerName).toBe('测试客户');
    expect(dto.status).toBe('pending');
  });

  it('未到期时计算 remainingDays', () => {
    const futureDeadline = new Date();
    futureDeadline.setDate(futureDeadline.getDate() + 10);
    const row = createRow({ deadline: futureDeadline.toISOString() as any, status: 'pending' });

    const dto = toDTO(row);
    expect(dto.remainingDays).toBeGreaterThanOrEqual(9);
    expect(dto.overdueDays).toBeUndefined();
    expect(dto.penaltyAmount).toBeUndefined();
  });

  it('已逾期时计算 overdueDays 和 penaltyAmount', () => {
    const pastDeadline = new Date();
    pastDeadline.setDate(pastDeadline.getDate() - 5);
    const row = createRow({ deadline: pastDeadline.toISOString() as any, status: 'pending' });

    const dto = toDTO(row);
    expect(dto.overdueDays).toBeGreaterThanOrEqual(4);
    expect(dto.penaltyAmount).toBeGreaterThanOrEqual(4 * 50);
    expect(dto.remainingDays).toBeUndefined();
  });

  it('已完成时不计算任何天数', () => {
    const row = createRow({ status: 'completed' });

    const dto = toDTO(row);
    expect(dto.remainingDays).toBeUndefined();
    expect(dto.overdueDays).toBeUndefined();
    expect(dto.penaltyAmount).toBeUndefined();
  });
});

describe('toDTOList', () => {
  it('批量转换', () => {
    const rows = [createRow({ id: 1 }), createRow({ id: 2 })];
    const dtos = toDTOList(rows);
    expect(dtos).toHaveLength(2);
    expect(dtos[0].id).toBe(1);
    expect(dtos[1].id).toBe(2);
  });

  it('空数组返回空', () => {
    expect(toDTOList([])).toEqual([]);
  });
});
