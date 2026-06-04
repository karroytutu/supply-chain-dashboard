/**
 * 考核管理 DTO 映射层单元测试
 * 测试 snake_case → camelCase 转换和 DECIMAL string → number 类型转换
 */

import { toDTO, toDTOList, toStatsDTO } from './assessment.mapper';
import type { AssessmentRecordRow, AssessmentStatsRow } from './assessment.types';

// 构造完整的 mock 数据库行
function createMockRow(overrides: Partial<AssessmentRecordRow> = {}): AssessmentRecordRow {
  return {
    id: 1,
    category: 'ar_collection',
    rule_type: 'tier1',
    source_type: 'ar_collection_task',
    source_id: 100,
    source_no: 'CS-20260501-001',
    source_name: '测试客户',
    assessment_user_id: 10,
    assessment_user_name: '张三',
    assessment_role: 'marketer',
    base_amount: '1000.50',
    penalty_rate: '0.70',
    overdue_days: 5,
    penalty_amount: '10.00',
    status: 'pending',
    handle_remark: null,
    handled_by: null,
    handled_at: null,
    oa_instance_id: null,
    appeal_reason: null,
    appeal_submitted_at: null,
    rule_snapshot: { tier: 'tier1' },
    calculated_at: '2026-05-01 10:00:00',
    created_at: '2026-05-01 10:00:00',
    updated_at: '2026-05-01 10:00:00',
    ...overrides,
  };
}

describe('assessment.mapper', () => {
  describe('toDTO', () => {
    it('将 snake_case 行转换为 camelCase DTO', () => {
      const row = createMockRow();
      const dto = toDTO(row);

      expect(dto.id).toBe(1);
      expect(dto.ruleType).toBe('tier1');
      expect(dto.sourceType).toBe('ar_collection_task');
      expect(dto.sourceId).toBe(100);
      expect(dto.sourceNo).toBe('CS-20260501-001');
      expect(dto.sourceName).toBe('测试客户');
      expect(dto.assessmentUserId).toBe(10);
      expect(dto.assessmentUserName).toBe('张三');
      expect(dto.assessmentRole).toBe('marketer');
      expect(dto.overdueDays).toBe(5);
      expect(dto.status).toBe('pending');
      expect(dto.handleRemark).toBeNull();
      expect(dto.handledBy).toBeNull();
      expect(dto.handledAt).toBeNull();
      expect(dto.oaInstanceId).toBeNull();
      expect(dto.appealReason).toBeNull();
      expect(dto.appealSubmittedAt).toBeNull();
      expect(dto.ruleSnapshot).toEqual({ tier: 'tier1' });
    });

    it('将 DECIMAL string 转换为 number', () => {
      const row = createMockRow({
        base_amount: '1500.75',
        penalty_rate: '0.30',
        penalty_amount: '450.23',
      });
      const dto = toDTO(row);

      expect(dto.baseAmount).toBe(1500.75);
      expect(dto.penaltyRate).toBe(0.30);
      expect(dto.penaltyAmount).toBe(450.23);
    });

    it('处理 null base_amount 和 penalty_rate', () => {
      const row = createMockRow({
        base_amount: null,
        penalty_rate: null,
        penalty_amount: '0',
      });
      const dto = toDTO(row);

      expect(dto.baseAmount).toBeNull();
      expect(dto.penaltyRate).toBeNull();
      expect(dto.penaltyAmount).toBe(0);
    });

    it('处理 null source_no 和 source_name', () => {
      const row = createMockRow({ source_no: null, source_name: null });
      const dto = toDTO(row);

      expect(dto.sourceNo).toBeNull();
      expect(dto.sourceName).toBeNull();
    });
  });

  describe('toDTOList', () => {
    it('批量转换行数组', () => {
      const rows = [
        createMockRow({ id: 1, penalty_amount: '10.00' }),
        createMockRow({ id: 2, penalty_amount: '20.00' }),
        createMockRow({ id: 3, penalty_amount: '30.00' }),
      ];
      const dtos = toDTOList(rows);

      expect(dtos).toHaveLength(3);
      expect(dtos[0].id).toBe(1);
      expect(dtos[0].penaltyAmount).toBe(10);
      expect(dtos[1].id).toBe(2);
      expect(dtos[1].penaltyAmount).toBe(20);
      expect(dtos[2].id).toBe(3);
      expect(dtos[2].penaltyAmount).toBe(30);
    });

    it('处理空数组', () => {
      expect(toDTOList([])).toEqual([]);
    });
  });

  describe('toStatsDTO', () => {
    it('将统计数据从 string/number 混合转换为 number', () => {
      const stats: AssessmentStatsRow = {
        total_amount: '15000.50' as any,
        pending_count: '5' as any,
        pending_amount: '3000.25' as any,
        confirmed_count: '10' as any,
        today_new: '2' as any,
        today_confirmed: '3' as any,
        involved_users: '8' as any,
      };
      const dto = toStatsDTO(stats);

      expect(dto.totalAmount).toBe(15000.5);
      expect(dto.pendingCount).toBe(5);
      expect(dto.pendingAmount).toBe(3000.25);
      expect(dto.confirmedCount).toBe(10);
      expect(dto.todayNew).toBe(2);
      expect(dto.todayConfirmed).toBe(3);
      expect(dto.involvedUsers).toBe(8);
    });

    it('处理全零统计', () => {
      const stats: AssessmentStatsRow = {
        total_amount: 0,
        pending_count: 0,
        pending_amount: 0,
        confirmed_count: 0,
        today_new: 0,
        today_confirmed: 0,
        involved_users: 0,
      };
      const dto = toStatsDTO(stats);

      expect(dto.totalAmount).toBe(0);
      expect(dto.pendingCount).toBe(0);
      expect(dto.pendingAmount).toBe(0);
    });

    it('处理 null/undefined 为 0', () => {
      const stats = {
        total_amount: null,
        pending_count: null,
        pending_amount: null,
        confirmed_count: null,
        today_new: null,
        today_confirmed: null,
        involved_users: null,
      } as unknown as AssessmentStatsRow;
      const dto = toStatsDTO(stats);

      expect(dto.totalAmount).toBe(0);
      expect(dto.pendingCount).toBe(0);
    });
  });
});
