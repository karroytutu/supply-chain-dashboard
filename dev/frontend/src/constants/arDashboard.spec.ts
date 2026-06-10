/**
 * arDashboard 常量单元测试
 * 验证颜色映射和状态标签映射的完整性
 */
import { describe, it, expect } from 'vitest';
import { KPI_COLOR_MAP, NODE_COLOR_MAP, STATUS_LABEL_MAP } from '@/constants/arDashboard';

describe('arDashboard 常量', () => {
  it('KPI_COLOR_MAP 覆盖所有 6 个 KPI 卡片 key', () => {
    const requiredKeys = [
      'totalReceivable', 'overdueAmount', 'customerCount',
      'dso', 'collectingTasks', 'upcomingExpiry',
    ];
    for (const key of requiredKeys) {
      expect(KPI_COLOR_MAP[key]).toBeDefined();
      expect(KPI_COLOR_MAP[key]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('NODE_COLOR_MAP 覆盖所有管道节点类型', () => {
    const requiredKeys = ['collecting', 'extension', 'escalated_L1', 'difference_processing', 'escalated_L2'];
    for (const key of requiredKeys) {
      expect(NODE_COLOR_MAP[key]).toBeDefined();
    }
  });

  it('STATUS_LABEL_MAP 覆盖所有催收状态', () => {
    const requiredStatuses: CollectionTaskStatus[] = ['collecting', 'difference_processing', 'extension', 'escalated', 'closed'];
    for (const status of requiredStatuses) {
      expect(STATUS_LABEL_MAP[status]).toBeDefined();
      expect(STATUS_LABEL_MAP[status].label.length).toBeGreaterThan(0);
      expect(STATUS_LABEL_MAP[status].color.length).toBeGreaterThan(0);
    }
  });

  it('STATUS_LABEL_MAP 中文标签正确', () => {
    expect(STATUS_LABEL_MAP.collecting.label).toBe('催收中');
    expect(STATUS_LABEL_MAP.extension.label).toBe('延期');
    expect(STATUS_LABEL_MAP.escalated.label).toBe('已升级');
    expect(STATUS_LABEL_MAP.closed.label).toBe('已关闭');
  });
});
