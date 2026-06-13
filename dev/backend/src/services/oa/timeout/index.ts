/**
 * OA节点时限模块 - 统一导出
 * @module services/oa/timeout
 */

// 类型导出
export type {
  OverdueNode,
  ScanResult,
  ResolvedReminderConfig,
  TimeoutLogEntry,
} from './oa-timeout.types';

// 服务
export { runOaTimeoutScan } from './oa-timeout.service';

// 定时任务
export { runOaTimeoutTask, runOaTimeoutAssessmentTask } from './oa-timeout.task';

// Repository
export * as timeoutRepository from './oa-timeout.repository';

// 考核规则注册（导入即执行）
import './oa-timeout-assessment';
