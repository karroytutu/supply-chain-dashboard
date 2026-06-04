/**
 * 固定资产工具函数单元测试
 * 纯函数测试，无需 mock
 */

jest.mock('../erp-client', () => ({
  getErpDefaults: () => ({ cid: '10008421', uid: '1' }),
}));

import {
  validateMaintenanceCost,
  validateQuotationCount,
  getApplicationStatusLabel,
  getApplicationTypeLabel,
  getStatusForNode,
  normalizeDateTime,
  generateNextAssetCode,
} from './fixed-asset-utils';

// ==================== validateMaintenanceCost ====================

describe('validateMaintenanceCost', () => {
  it('低于100元返回错误', () => {
    expect(validateMaintenanceCost(50)).toContain('100元以下');
    expect(validateMaintenanceCost(99)).not.toBeNull();
  });

  it('等于100元通过', () => {
    expect(validateMaintenanceCost(100)).toBeNull();
  });

  it('高于100元通过', () => {
    expect(validateMaintenanceCost(500)).toBeNull();
    expect(validateMaintenanceCost(10000)).toBeNull();
  });
});

// ==================== validateQuotationCount ====================

describe('validateQuotationCount', () => {
  it('费用 >= 500 且询价 < 2 返回错误', () => {
    expect(validateQuotationCount(500, 1)).toContain('至少录入2家');
    expect(validateQuotationCount(1000, 0)).not.toBeNull();
  });

  it('费用 >= 500 且询价 >= 2 通过', () => {
    expect(validateQuotationCount(500, 2)).toBeNull();
    expect(validateQuotationCount(1000, 3)).toBeNull();
  });

  it('费用 < 500 不需要询价', () => {
    expect(validateQuotationCount(499, 0)).toBeNull();
    expect(validateQuotationCount(100, 1)).toBeNull();
  });
});

// ==================== getApplicationStatusLabel ====================

describe('getApplicationStatusLabel', () => {
  it('返回正确的状态标签', () => {
    expect(getApplicationStatusLabel('pending')).toBe('待审批');
    expect(getApplicationStatusLabel('quoting')).toBe('询价中');
    expect(getApplicationStatusLabel('paying')).toBe('支付中');
    expect(getApplicationStatusLabel('purchasing')).toBe('采购中');
    expect(getApplicationStatusLabel('storing')).toBe('入库中');
    expect(getApplicationStatusLabel('approved')).toBe('审批通过');
    expect(getApplicationStatusLabel('rejected')).toBe('已驳回');
    expect(getApplicationStatusLabel('cancelled')).toBe('已取消');
    expect(getApplicationStatusLabel('completed')).toBe('已完成');
    expect(getApplicationStatusLabel('erp_failed')).toBe('ERP操作失败');
  });
});

// ==================== getApplicationTypeLabel ====================

describe('getApplicationTypeLabel', () => {
  it('返回正确的类型标签', () => {
    expect(getApplicationTypeLabel('purchase')).toBe('采购申请');
    expect(getApplicationTypeLabel('transfer')).toBe('领用调拨');
    expect(getApplicationTypeLabel('maintenance')).toBe('维修申请');
    expect(getApplicationTypeLabel('disposal')).toBe('清理申请');
  });
});

// ==================== getStatusForNode ====================

describe('getStatusForNode', () => {
  it('采购申请：节点3→询价中', () => {
    expect(getStatusForNode('purchase', 3)).toBe('quoting');
  });

  it('采购申请：节点5→支付中', () => {
    expect(getStatusForNode('purchase', 5)).toBe('paying');
  });

  it('采购申请：节点6→采购中', () => {
    expect(getStatusForNode('purchase', 6)).toBe('purchasing');
  });

  it('采购申请：节点7→入库中', () => {
    expect(getStatusForNode('purchase', 7)).toBe('storing');
  });

  it('采购申请：未映射节点→待审批', () => {
    expect(getStatusForNode('purchase', 1)).toBe('pending');
    expect(getStatusForNode('purchase', 2)).toBe('pending');
  });

  it('维修申请：节点2→询价中', () => {
    expect(getStatusForNode('maintenance', 2)).toBe('quoting');
  });

  it('维修申请：节点4→支付中', () => {
    expect(getStatusForNode('maintenance', 4)).toBe('paying');
  });

  it('其他类型始终返回 pending', () => {
    expect(getStatusForNode('transfer', 3)).toBe('pending');
    expect(getStatusForNode('disposal', 5)).toBe('pending');
  });
});

// ==================== normalizeDateTime ====================

describe('normalizeDateTime', () => {
  it('null/undefined 返回当天日期 + 默认时间', () => {
    const result1 = normalizeDateTime(null);
    expect(result1).toMatch(/\d{4}-\d{2}-\d{2} 12:00:00/);

    const result2 = normalizeDateTime(undefined);
    expect(result2).toMatch(/\d{4}-\d{2}-\d{2} 12:00:00/);
  });

  it('仅日期字符串追加默认时间', () => {
    expect(normalizeDateTime('2026-06-15')).toBe('2026-06-15 12:00:00');
  });

  it('已含时间部分原样返回', () => {
    expect(normalizeDateTime('2026-06-15 14:30:00')).toBe('2026-06-15 14:30:00');
  });
});

// ==================== generateNextAssetCode ====================

describe('generateNextAssetCode', () => {
  it('空列表返回 1', () => {
    expect(generateNextAssetCode([])).toBe(1);
  });

  it('基于最大编码递增', () => {
    const assets = [
      { code: 'GDZC-0001' },
      { code: 'GDZC-0005' },
      { code: 'GDZC-0003' },
    ] as any[];

    expect(generateNextAssetCode(assets)).toBe(6);
  });

  it('忽略非 GDZC 前缀编码', () => {
    const assets = [
      { code: 'OTHER-9999' },
      { code: 'GDZC-0002' },
    ] as any[];

    expect(generateNextAssetCode(assets)).toBe(3);
  });

  it('忽略无效编码', () => {
    const assets = [
      { code: 'GDZC-' },
      { code: 'GDZC-abc' },
      { code: null },
    ] as any[];

    expect(generateNextAssetCode(assets)).toBe(1);
  });
});
