/**
 * 配置阈值 API 控制器
 * 提供前端获取后端业务阈值配置的统一接口
 * 遵循规范：方案A - 前端通过 API 获取后端配置值
 */

import { Request, Response } from 'express';
import { buildSuccessResponse } from '../utils/response';
import {
  TURNOVER_EXCELLENT_DAYS,
  TURNOVER_GOOD_DAYS,
  TURNOVER_ATTENTION_DAYS,
  OVERSTOCK_MILD_DAYS,
  OVERSTOCK_MODERATE_DAYS,
  OVERSTOCK_SERIOUS_DAYS,
  LOW_STOCK_DAYS,
  EXPIRING_SERIOUS_DAYS,
  EXPIRING_WARNING_DAYS,
  EXPIRING_ATTENTION_DAYS,
  EXPIRING_RATE_SERIOUS,
  EXPIRING_RATE_WARNING,
  EXPIRING_RATE_ATTENTION,
  SLOW_MOVING_MILD_DAYS,
  SLOW_MOVING_MODERATE_DAYS,
  SLOW_MOVING_SERIOUS_DAYS,
  AR_EXTENSION_MAX_DAYS,
  AR_DEFAULT_EXPIRE_DAYS,
  AR_ASSESSMENT_EFFECTIVE_DATE,
  RETURN_EXPIRE_INSUFFICIENT_DAYS,
} from '../utils/constants';

/**
 * GET /api/config/thresholds
 * 返回所有业务阈值配置，供前端同步使用
 */
export function getThresholds(_req: Request, res: Response): void {
  res.json(buildSuccessResponse({
    // 周转相关
    turnover: {
      excellentDays: TURNOVER_EXCELLENT_DAYS,
      goodDays: TURNOVER_GOOD_DAYS,
      attentionDays: TURNOVER_ATTENTION_DAYS,
    },
    // 库存积压
    overstock: {
      mildDays: OVERSTOCK_MILD_DAYS,
      moderateDays: OVERSTOCK_MODERATE_DAYS,
      seriousDays: OVERSTOCK_SERIOUS_DAYS,
    },
    // 低库存
    lowStock: {
      days: LOW_STOCK_DAYS,
    },
    // 临期预警
    expiring: {
      seriousDays: EXPIRING_SERIOUS_DAYS,
      warningDays: EXPIRING_WARNING_DAYS,
      attentionDays: EXPIRING_ATTENTION_DAYS,
      rateSerious: EXPIRING_RATE_SERIOUS,
      rateWarning: EXPIRING_RATE_WARNING,
      rateAttention: EXPIRING_RATE_ATTENTION,
    },
    // 滞销
    slowMoving: {
      mildDays: SLOW_MOVING_MILD_DAYS,
      moderateDays: SLOW_MOVING_MODERATE_DAYS,
      seriousDays: SLOW_MOVING_SERIOUS_DAYS,
    },
    // 催收
    arCollection: {
      extensionMaxDays: AR_EXTENSION_MAX_DAYS,
      defaultExpireDays: AR_DEFAULT_EXPIRE_DAYS,
      assessmentEffectiveDate: AR_ASSESSMENT_EFFECTIVE_DATE,
    },
    // 退货考核
    returnPenalty: {
      expireInsufficientDays: RETURN_EXPIRE_INSUFFICIENT_DAYS,
    },
  }));
}
