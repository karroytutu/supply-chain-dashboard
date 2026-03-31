/**
 * 退货考核模块导出
 */

// 类型定义
export type {
  PenaltyType,
  PenaltyRole,
  PenaltyStatus,
  PenaltyRecord,
  PenaltyQueryParams,
  PenaltyStats,
  CreatePenaltyParams,
  UpdatePenaltyStatusParams,
  PenaltyRuleConfig,
} from './return-penalty.types';

export {
  PENALTY_RULES,
  PENALTY_TYPE_NAMES,
  PENALTY_ROLE_NAMES,
} from './return-penalty.types';

// 查询服务
export {
  getPenalties,
  getMyPenalties,
  getPenaltyById,
  getPenaltyStats,
  updatePenaltyStatus,
} from './return-penalty.service';

// 计算服务
export {
  calculateReturnPenalties,
  createReturnExpireInsufficientPenalty,
  getPurchasePrice,
  findUserByName,
  getUsersByRole,
} from './return-penalty-calculate';

// 通知服务
export {
  sendPenaltyNotification,
  sendBatchPenaltyNotifications,
  notifyPenaltyCreated,
} from './return-penalty-notify';
