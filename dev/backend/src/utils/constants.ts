/**
 * 业务常量定义
 * 集中管理供应链仪表盘中的业务阈值和配置
 */

// ==================== 周转相关阈值 ====================

/** 周转天数 - 优秀阈值（天数） */
export const TURNOVER_EXCELLENT_DAYS = 15;

/** 周转天数 - 良好阈值（天数） */
export const TURNOVER_GOOD_DAYS = 30;

/** 周转天数 - 关注阈值（天数） */
export const TURNOVER_ATTENTION_DAYS = 45;

/** 标准计算周期（天数） */
export const STANDARD_CALC_DAYS = 30;

// ==================== 库存积压阈值 ====================

/** 积压 - 轻度阈值（可售天数 > 60天） */
export const OVERSTOCK_MILD_DAYS = 60;

/** 积压 - 中度阈值（可售天数 > 90天） */
export const OVERSTOCK_MODERATE_DAYS = 90;

/** 积压 - 严重阈值（可售天数 > 120天） */
export const OVERSTOCK_SERIOUS_DAYS = 120;

// ==================== 低库存阈值 ====================

/** 低库存阈值（可售天数 <= 15天） */
export const LOW_STOCK_DAYS = 15;

// ==================== 临期阈值 ====================

/** 临期 - 严重预警（7天内） */
export const EXPIRING_SERIOUS_DAYS = 7;

/** 临期 - 警告（15天内） */
export const EXPIRING_WARNING_DAYS = 15;

/** 临期 - 关注（30天内） */
export const EXPIRING_ATTENTION_DAYS = 30;

/** 临期阈值配置（基于保质期） */
export const EXPIRING_THRESHOLDS = {
  /** 保质期 <= 90天：临期阈值30天 */
  SHORT_SHELF_LIFE: { maxShelfLife: 90, threshold: 30 },
  /** 保质期 91-150天：临期阈值45天 */
  MEDIUM_SHELF_LIFE: { minShelfLife: 91, maxShelfLife: 150, threshold: 45 },
  /** 保质期 151-270天：临期阈值60天 */
  LONG_SHELF_LIFE: { minShelfLife: 151, maxShelfLife: 270, threshold: 60 },
  /** 保质期 >= 271天：临期阈值90天 */
  VERY_LONG_SHELF_LIFE: { minShelfLife: 271, threshold: 90 },
} as const;

// ==================== 滞销阈值 ====================

/** 滞销 - 轻度阈值（未销售天数 > 7天） */
export const SLOW_MOVING_MILD_DAYS = 7;

/** 滞销 - 中度阈值（未销售天数 > 15天） */
export const SLOW_MOVING_MODERATE_DAYS = 15;

/** 滞销 - 严重阈值（未销售天数 > 30天） */
export const SLOW_MOVING_SERIOUS_DAYS = 30;

// ==================== 预警级别阈值 ====================

/** 临期率 - 严重预警阈值（%） */
export const EXPIRING_RATE_SERIOUS = 5;

/** 临期率 - 警告阈值（%） */
export const EXPIRING_RATE_WARNING = 3;

/** 临期率 - 关注阈值（%） */
export const EXPIRING_RATE_ATTENTION = 1;

// ==================== 工具函数 ====================

/**
 * 根据保质期获取临期阈值天数
 */
export function getExpiringThreshold(shelfLife: number): number {
  if (shelfLife <= EXPIRING_THRESHOLDS.SHORT_SHELF_LIFE.maxShelfLife) {
    return EXPIRING_THRESHOLDS.SHORT_SHELF_LIFE.threshold;
  }
  if (shelfLife <= EXPIRING_THRESHOLDS.MEDIUM_SHELF_LIFE.maxShelfLife) {
    return EXPIRING_THRESHOLDS.MEDIUM_SHELF_LIFE.threshold;
  }
  if (shelfLife <= EXPIRING_THRESHOLDS.LONG_SHELF_LIFE.maxShelfLife) {
    return EXPIRING_THRESHOLDS.LONG_SHELF_LIFE.threshold;
  }
  return EXPIRING_THRESHOLDS.VERY_LONG_SHELF_LIFE.threshold;
}

/**
 * 获取周转健康状态
 */
export function getTurnoverHealthStatus(turnoverDays: number): 'excellent' | 'good' | 'attention' | 'warning' {
  if (turnoverDays <= TURNOVER_EXCELLENT_DAYS) return 'excellent';
  if (turnoverDays <= TURNOVER_GOOD_DAYS) return 'good';
  if (turnoverDays <= TURNOVER_ATTENTION_DAYS) return 'attention';
  return 'warning';
}

/**
 * 获取临期预警级别
 */
export function getExpiringWarningLevel(expiringRate: number): 'normal' | 'attention' | 'warning' | 'serious' {
  if (expiringRate > EXPIRING_RATE_SERIOUS) return 'serious';
  if (expiringRate > EXPIRING_RATE_WARNING) return 'warning';
  if (expiringRate > EXPIRING_RATE_ATTENTION) return 'attention';
  return 'normal';
}
