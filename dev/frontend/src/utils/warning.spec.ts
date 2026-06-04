/**
 * 预警工具单元测试
 * 测试 EXPIRING_WARNING_CONFIG、getExpiringWarningLevel、getSlowMovingWarningLevel、
 * getTurnoverHealthStatus、getOverallWarningLevel
 */

import { describe, it, expect } from 'vitest';
import {
  EXPIRING_WARNING_CONFIG,
  SLOW_MOVING_WARNING_CONFIG,
  HEALTH_STATUS_CONFIG,
  getExpiringWarningLevel,
  getSlowMovingWarningLevel,
  getTurnoverHealthStatus,
  getHealthStatusConfig,
  getWarningConfig,
  getOverallWarningLevel,
} from './warning';

// ==================== 配置完整性 ====================

describe('EXPIRING_WARNING_CONFIG', () => {
  it('包含 4 个级别', () => {
    expect(Object.keys(EXPIRING_WARNING_CONFIG)).toEqual(
      expect.arrayContaining(['serious', 'warning', 'attention', 'normal'])
    );
  });

  it('阈值递增', () => {
    expect(EXPIRING_WARNING_CONFIG.serious.threshold).toBeLessThan(EXPIRING_WARNING_CONFIG.warning.threshold);
    expect(EXPIRING_WARNING_CONFIG.warning.threshold).toBeLessThan(EXPIRING_WARNING_CONFIG.attention.threshold);
  });

  it('阈值与后端常量一致（7/15/30）', () => {
    expect(EXPIRING_WARNING_CONFIG.serious.threshold).toBe(7);
    expect(EXPIRING_WARNING_CONFIG.warning.threshold).toBe(15);
    expect(EXPIRING_WARNING_CONFIG.attention.threshold).toBe(30);
  });
});

describe('SLOW_MOVING_WARNING_CONFIG', () => {
  it('阈值正确（90/60/30）', () => {
    expect(SLOW_MOVING_WARNING_CONFIG.serious.threshold).toBe(90);
    expect(SLOW_MOVING_WARNING_CONFIG.warning.threshold).toBe(60);
    expect(SLOW_MOVING_WARNING_CONFIG.attention.threshold).toBe(30);
  });
});

describe('HEALTH_STATUS_CONFIG', () => {
  it('包含 4 个状态', () => {
    expect(Object.keys(HEALTH_STATUS_CONFIG)).toEqual(
      expect.arrayContaining(['excellent', 'good', 'attention', 'warning'])
    );
  });
});

// ==================== getExpiringWarningLevel ====================

describe('getExpiringWarningLevel', () => {
  it('≤7天 → serious', () => {
    expect(getExpiringWarningLevel(0).level).toBe('serious');
    expect(getExpiringWarningLevel(7).level).toBe('serious');
  });

  it('8-15天 → warning', () => {
    expect(getExpiringWarningLevel(8).level).toBe('warning');
    expect(getExpiringWarningLevel(15).level).toBe('warning');
  });

  it('16-30天 → attention', () => {
    expect(getExpiringWarningLevel(16).level).toBe('attention');
    expect(getExpiringWarningLevel(30).level).toBe('attention');
  });

  it('>30天 → normal', () => {
    expect(getExpiringWarningLevel(31).level).toBe('normal');
    expect(getExpiringWarningLevel(365).level).toBe('normal');
  });
});

// ==================== getSlowMovingWarningLevel ====================

describe('getSlowMovingWarningLevel', () => {
  it('≥90天 → serious', () => {
    expect(getSlowMovingWarningLevel(90).level).toBe('serious');
    expect(getSlowMovingWarningLevel(365).level).toBe('serious');
  });

  it('60-89天 → warning', () => {
    expect(getSlowMovingWarningLevel(60).level).toBe('warning');
    expect(getSlowMovingWarningLevel(89).level).toBe('warning');
  });

  it('30-59天 → attention', () => {
    expect(getSlowMovingWarningLevel(30).level).toBe('attention');
    expect(getSlowMovingWarningLevel(59).level).toBe('attention');
  });

  it('<30天 → normal', () => {
    expect(getSlowMovingWarningLevel(0).level).toBe('normal');
    expect(getSlowMovingWarningLevel(29).level).toBe('normal');
  });
});

// ==================== getTurnoverHealthStatus ====================

describe('getTurnoverHealthStatus', () => {
  it('<15天 → excellent', () => {
    expect(getTurnoverHealthStatus(0)).toBe('excellent');
    expect(getTurnoverHealthStatus(14)).toBe('excellent');
  });

  it('15-30天 → good', () => {
    expect(getTurnoverHealthStatus(15)).toBe('good');
    expect(getTurnoverHealthStatus(30)).toBe('good');
  });

  it('31-45天 → attention', () => {
    expect(getTurnoverHealthStatus(31)).toBe('attention');
    expect(getTurnoverHealthStatus(45)).toBe('attention');
  });

  it('>45天 → warning', () => {
    expect(getTurnoverHealthStatus(46)).toBe('warning');
    expect(getTurnoverHealthStatus(365)).toBe('warning');
  });
});

// ==================== getHealthStatusConfig ====================

describe('getHealthStatusConfig', () => {
  it('返回对应配置', () => {
    const config = getHealthStatusConfig('excellent');
    expect(config).toHaveProperty('color');
    expect(config).toHaveProperty('label');
    expect(config.label).toBe('优秀');
  });
});

// ==================== getWarningConfig ====================

describe('getWarningConfig', () => {
  it('临期预警', () => {
    const config = getWarningConfig('expiring', 'serious');
    expect(config.threshold).toBe(7);
  });

  it('滞销预警', () => {
    const config = getWarningConfig('slowMoving', 'serious');
    expect(config.threshold).toBe(90);
  });
});

// ==================== getOverallWarningLevel ====================

describe('getOverallWarningLevel', () => {
  describe('临期预警', () => {
    it('>5% → serious', () => {
      expect(getOverallWarningLevel('expiring', 6)).toBe('serious');
    });

    it('3-5% → warning', () => {
      expect(getOverallWarningLevel('expiring', 4)).toBe('warning');
    });

    it('1-3% → attention', () => {
      expect(getOverallWarningLevel('expiring', 2)).toBe('attention');
    });

    it('≤1% → normal', () => {
      expect(getOverallWarningLevel('expiring', 1)).toBe('normal');
      expect(getOverallWarningLevel('expiring', 0)).toBe('normal');
    });
  });

  describe('滞销预警', () => {
    it('>10% → serious', () => {
      expect(getOverallWarningLevel('slowMoving', 11)).toBe('serious');
    });

    it('7-10% → warning', () => {
      expect(getOverallWarningLevel('slowMoving', 8)).toBe('warning');
    });

    it('5-7% → attention', () => {
      expect(getOverallWarningLevel('slowMoving', 6)).toBe('attention');
    });

    it('≤5% → normal', () => {
      expect(getOverallWarningLevel('slowMoving', 5)).toBe('normal');
    });
  });
});
