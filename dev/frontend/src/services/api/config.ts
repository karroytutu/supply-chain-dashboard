/**
 * 配置 API
 * 获取后端业务阈值配置
 */

import request from './request';

export interface ThresholdConfig {
  turnover: {
    excellentDays: number;
    goodDays: number;
    attentionDays: number;
  };
  overstock: {
    mildDays: number;
    moderateDays: number;
    seriousDays: number;
  };
  lowStock: {
    days: number;
  };
  expiring: {
    seriousDays: number;
    warningDays: number;
    attentionDays: number;
    rateSerious: number;
    rateWarning: number;
    rateAttention: number;
  };
  slowMoving: {
    mildDays: number;
    moderateDays: number;
    seriousDays: number;
  };
  arCollection: {
    extensionMaxDays: number;
    defaultExpireDays: number;
    assessmentEffectiveDate: string;
  };
  returnPenalty: {
    expireInsufficientDays: number;
  };
}

let cachedThresholds: ThresholdConfig | null = null;

/**
 * 获取后端业务阈值配置
 * 缓存结果，避免重复请求
 */
export async function getThresholds(): Promise<ThresholdConfig> {
  if (cachedThresholds) return cachedThresholds;

  const result = await request.get<ThresholdConfig>('/config/thresholds');
  cachedThresholds = result;
  return result;
}

/**
 * 清除阈值缓存（用于强制刷新）
 */
export function clearThresholdsCache(): void {
  cachedThresholds = null;
}
