/**
 * 逾期管理模块统一入口
 */

// 逾期等级计算服务
export {
  calculateOverdueLevel,
  updateOverdueLevels,
  getCustomerOverdueLevel,
  getBatchCustomerOverdueLevels,
} from './overdue-level.service';

// 时限配置服务
export {
  getDeadlineConfigs,
  updateDeadlineConfig,
  calculateNodeDeadline,
  getDeadlineHours,
  calculateBatchNodeDeadlines,
  getWarningHours,
  clearDeadlineConfigCache,
} from './deadline.service';

// 逾期统计服务
export {
  getOverdueStats,
  saveOverdueSnapshot,
  getOverdueSnapshots,
} from './overdue-stats.service';

// 超时预警服务
export {
  checkTimeoutTasks,
  getTimeoutWarnings,
  processTimeoutWarnings,
} from './timeout-warning.service';

// 预处理服务
export {
  getPreprocessingList,
  startPreprocessing,
  completePreprocessing,
  batchStartPreprocessing,
  batchCompletePreprocessing,
  getPreprocessingTaskBills,
} from './preprocessing.service';

// 凭证标记服务
export {
  markVoucherStatus,
  batchMarkVoucherStatus,
  getVoucherStats,
  getBillVoucherMarks,
} from './voucher-mark.service';

// 任务分配服务
export {
  getAssignmentList,
  assignTask,
  batchAssignTasks,
  getAvailableCollectors,
} from './assignment.service';
