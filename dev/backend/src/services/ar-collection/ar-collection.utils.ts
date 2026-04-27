/**
 * 催收管理 - 工具函数
 */

import type { Priority } from './ar-collection.types';
import { AR_EXTENSION_MAX_DAYS, EXPIRING_WARNING_DAYS, EXPIRING_SERIOUS_DAYS } from '../../utils/constants';

/**
 * 根据逾期天数计算优先级
 */
export function calcPriority(overdueDays: number): Priority {
  if (overdueDays >= AR_EXTENSION_MAX_DAYS) return 'critical';
  if (overdueDays >= EXPIRING_WARNING_DAYS) return 'high';
  if (overdueDays >= EXPIRING_SERIOUS_DAYS) return 'medium';
  return 'low';
}
