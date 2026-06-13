/**
 * OA节点时限 - 内部类型定义
 * @module services/oa/timeout/oa-timeout.types
 */

import type { OaNodeRow, ReminderConfig, AssessmentConfig } from '../oa.types';

/** 超时节点（含催办扫描所需字段） */
export interface OverdueNode extends OaNodeRow {
  /** 实例编号 */
  instance_no: string;
  /** 实例标题 */
  title: string;
  /** 表单类型名称 */
  form_type_name: string;
}

/** 催办扫描结果 */
export interface ScanResult {
  /** 扫描到的超时节点数 */
  scanned: number;
  /** 实际发送催办数 */
  reminded: number;
  /** 实际抄送上级数 */
  ccSupervisor: number;
}

/** 解析后的催办配置（合并默认值） */
export interface ResolvedReminderConfig {
  firstReminderDelayMinutes: number;
  intervalMinutes: number;
  maxReminders: number;
  ccSupervisorAfterCount: number;
}

/** 催办日志条目 */
export interface TimeoutLogEntry {
  node_id: number;
  instance_id: number;
  log_type: 'reminder' | 'cc_supervisor' | 'manual_remind';
  recipient_user_id: number | null;
  recipient_user_name: string | null;
  is_supervisor_cc: boolean;
  message_content: Record<string, unknown> | null;
}

/** 考核计算结果 */
export interface TimeoutAssessmentResult {
  /** OA 节点 ID */
  source_id: number;
  /** 被考核人 ID */
  assessment_user_id: number;
  /** 被考核人姓名 */
  assessment_user_name: string;
  /** 实例 ID */
  instance_id: number;
  /** 实例编号 */
  instance_no: string;
  /** 节点名称 */
  node_name: string;
  /** 匹配到的阶梯名称 */
  tier_name: string;
  /** 超时天数 */
  overdue_days: number;
  /** 考核金额 */
  penalty_amount: number;
}
