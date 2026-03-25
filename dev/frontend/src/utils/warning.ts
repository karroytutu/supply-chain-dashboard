import type { WarningLevel, HealthStatus } from '../types/dashboard';

// 预警配置
export interface WarningConfig {
  level: WarningLevel;
  threshold: number;
  color: string;
  bgColor: string;
  icon: string;
  label: string;
}

// 临期预警配置
export const EXPIRING_WARNING_CONFIG: Record<WarningLevel, WarningConfig> = {
  serious: {
    level: 'serious',
    threshold: 7,
    color: '#ff4d4f',
    bgColor: '#fff1f0',
    icon: '🔴',
    label: '严重',
  },
  warning: {
    level: 'warning',
    threshold: 15,
    color: '#faad14',
    bgColor: '#fffbe6',
    icon: '🟠',
    label: '警告',
  },
  attention: {
    level: 'attention',
    threshold: 30,
    color: '#fadb14',
    bgColor: '#fffff0',
    icon: '🟡',
    label: '关注',
  },
  normal: {
    level: 'normal',
    threshold: Infinity,
    color: '#52c41a',
    bgColor: '#f6ffed',
    icon: '🟢',
    label: '正常',
  },
};

// 滞销预警配置
export const SLOW_MOVING_WARNING_CONFIG: Record<WarningLevel, WarningConfig> = {
  serious: {
    level: 'serious',
    threshold: 90,
    color: '#ff4d4f',
    bgColor: '#fff1f0',
    icon: '🔴',
    label: '严重滞销',
  },
  warning: {
    level: 'warning',
    threshold: 60,
    color: '#faad14',
    bgColor: '#fffbe6',
    icon: '🟠',
    label: '滞销',
  },
  attention: {
    level: 'attention',
    threshold: 30,
    color: '#fadb14',
    bgColor: '#fffff0',
    icon: '🟡',
    label: '关注',
  },
  normal: {
    level: 'normal',
    threshold: 0,
    color: '#52c41a',
    bgColor: '#f6ffed',
    icon: '🟢',
    label: '正常',
  },
};

// 健康状态配置
export const HEALTH_STATUS_CONFIG: Record<HealthStatus, { color: string; label: string }> = {
  excellent: { color: '#52c41a', label: '优秀' },
  good: { color: '#1890ff', label: '良好' },
  attention: { color: '#faad14', label: '关注' },
  warning: { color: '#ff4d4f', label: '预警' },
};

/**
 * 获取临期预警级别
 * @param daysToExpiry 距离过期天数
 */
export const getExpiringWarningLevel = (daysToExpiry: number): WarningConfig => {
  if (daysToExpiry <= 7) return EXPIRING_WARNING_CONFIG.serious;
  if (daysToExpiry <= 15) return EXPIRING_WARNING_CONFIG.warning;
  if (daysToExpiry <= 30) return EXPIRING_WARNING_CONFIG.attention;
  return EXPIRING_WARNING_CONFIG.normal;
};

/**
 * 获取滞销预警级别
 * @param daysWithoutSales 未销售天数
 */
export const getSlowMovingWarningLevel = (daysWithoutSales: number): WarningConfig => {
  if (daysWithoutSales >= 90) return SLOW_MOVING_WARNING_CONFIG.serious;
  if (daysWithoutSales >= 60) return SLOW_MOVING_WARNING_CONFIG.warning;
  if (daysWithoutSales >= 30) return SLOW_MOVING_WARNING_CONFIG.attention;
  return SLOW_MOVING_WARNING_CONFIG.normal;
};

/**
 * 获取周转健康状态
 * @param turnoverDays 周转天数
 */
export const getTurnoverHealthStatus = (turnoverDays: number): HealthStatus => {
  if (turnoverDays < 15) return 'excellent';
  if (turnoverDays <= 30) return 'good';
  if (turnoverDays <= 45) return 'attention';
  return 'warning';
};

/**
 * 获取健康状态配置
 * @param status 健康状态
 */
export const getHealthStatusConfig = (status: HealthStatus) => {
  return HEALTH_STATUS_CONFIG[status];
};

/**
 * 获取预警配置
 * @param type 预警类型
 * @param level 预警级别
 */
export const getWarningConfig = (
  type: 'expiring' | 'slowMoving',
  level: WarningLevel,
): WarningConfig => {
  const config = type === 'expiring' ? EXPIRING_WARNING_CONFIG : SLOW_MOVING_WARNING_CONFIG;
  return config[level];
};

/**
 * 根据占比判断整体预警级别
 * @param type 预警类型
 * @param percentage 占比百分比
 */
export const getOverallWarningLevel = (
  type: 'expiring' | 'slowMoving',
  percentage: number,
): WarningLevel => {
  if (type === 'expiring') {
    if (percentage > 5) return 'serious';
    if (percentage > 3) return 'warning';
    if (percentage > 1) return 'attention';
    return 'normal';
  } else {
    if (percentage > 10) return 'serious';
    if (percentage > 7) return 'warning';
    if (percentage > 5) return 'attention';
    return 'normal';
  }
};
