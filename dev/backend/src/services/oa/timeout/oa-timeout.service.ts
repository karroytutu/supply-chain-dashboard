/**
 * OA节点时限 - 核心扫描逻辑
 * @module services/oa/timeout/oa-timeout.service
 *
 * 纯轮询方案（1分钟 cron）：
 * - 首次超时检测 + 后续催办间隔检查 + 抄送上级，全部由同一 cron 处理
 * - 无状态设计，服务器重启后自动恢复
 */

import { createLogger } from '../../../utils/logger';
const log = createLogger('OaTimeout');

import {
  OA_TIMEOUT_REMINDER_BATCH_SIZE,
  OA_TIMEOUT_REMINDER_BATCH_INTERVAL_MS,
} from '../../../utils/constants';
import * as repository from './oa-timeout.repository';
import { sendReminder, sendSupervisorCc } from './oa-timeout-reminder';
import type { OverdueNode, ScanResult, ResolvedReminderConfig, TimeoutLogEntry } from './oa-timeout.types';
import type { ReminderConfig } from '../oa.types';
import { withAdvisoryLock } from '../../../utils/distributed-lock';

/**
 * 执行催办扫描（使用 PostgreSQL advisory lock 防止多实例并发）
 */
export async function runOaTimeoutScan(): Promise<void> {
  try {
    await withAdvisoryLock('oa:timeout:scan', async () => {
      await scanAndRemind();
    });
  } catch (error) {
    log.error('催办扫描异常:', error);
  }
}

// =====================================================
// 核心扫描
// =====================================================

/**
 * 扫描超时节点并发送催办/抄送通知
 */
async function scanAndRemind(): Promise<ScanResult> {
  const overdueNodes = await repository.getOverdueNodesWithReminder();
  let reminded = 0;
  let ccSupervisor = 0;

  for (const node of overdueNodes) {
    const reminderCfg = resolveReminderConfig(node.timeout_config?.reminder);

    // 催办判断
    if (reminderCfg && shouldRemind(node, reminderCfg)) {
      await sendReminder(node);
      await repository.updateReminderState(node.id, {
        last_reminder_at: new Date(),
        reminder_count: node.reminder_count + 1,
      });
      await repository.insertTimeoutLog({
        node_id: node.id,
        instance_id: node.instance_id,
        log_type: 'reminder',
        recipient_user_id: node.assigned_user_ids?.[0] ?? null,
        recipient_user_name: node.first_assigned_user_name ?? null,
        is_supervisor_cc: false,
        message_content: { reminder_count: node.reminder_count + 1 },
      });
      reminded++;
      node.reminder_count += 1; // 同步本地值，确保后续抄送日志记录正确的 reminder_count
    }

    // 抄送上级判断
    if (reminderCfg && shouldCcSupervisor(node, reminderCfg)) {
      const sent = await sendSupervisorCc(node);
      if (sent) {
        await repository.updateReminderState(node.id, {
          cc_supervisor_at: new Date(),
        });
        await repository.insertTimeoutLog({
          node_id: node.id,
          instance_id: node.instance_id,
          log_type: 'cc_supervisor',
          recipient_user_id: null, // supervisor ID logged in sendSupervisorCc
          recipient_user_name: null,
          is_supervisor_cc: true,
          message_content: { reminder_count: node.reminder_count },
        });
        ccSupervisor++;
      }
    }

    // 批量限速
    if ((reminded + ccSupervisor) > 0 && (reminded + ccSupervisor) % OA_TIMEOUT_REMINDER_BATCH_SIZE === 0) {
      await sleep(OA_TIMEOUT_REMINDER_BATCH_INTERVAL_MS);
    }
  }

  if (overdueNodes.length > 0) {
    log.info(`催办扫描完成: 扫描${overdueNodes.length}个, 催办${reminded}个, 抄送上级${ccSupervisor}个`);
  }

  return { scanned: overdueNodes.length, reminded, ccSupervisor };
}

// =====================================================
// 判断逻辑
// =====================================================

/**
 * 判断是否应该催办
 */
function shouldRemind(node: OverdueNode, config: ResolvedReminderConfig | null): boolean {
  if (!config) return false;

  const now = Date.now();
  const deadline = new Date(node.deadline_at!).getTime();

  // 检查是否过了首次催办延迟
  const firstRemindAt = deadline + config.firstReminderDelayMinutes * 60000;
  if (now < firstRemindAt) return false;

  // 检查是否超过最大催办次数
  if (node.reminder_count >= config.maxReminders) return false;

  // 检查催办间隔
  if (node.last_reminder_at) {
    const elapsed = now - new Date(node.last_reminder_at).getTime();
    if (elapsed < config.intervalMinutes * 60000) return false;
  }

  return true;
}

/**
 * 判断是否应该抄送上级
 */
function shouldCcSupervisor(node: OverdueNode, config: ResolvedReminderConfig | null): boolean {
  if (!config) return false;

  return (
    config.ccSupervisorAfterCount > 0 &&
    node.reminder_count >= config.ccSupervisorAfterCount &&
    !node.cc_supervisor_at
  );
}

// =====================================================
// 配置解析
// =====================================================

/**
 * 解析催办配置，要求节点提供完整的核心字段（intervalMinutes、maxReminders）。
 * 可选字段（firstReminderDelayMinutes、ccSupervisorAfterCount）缺失时用零值兜底。
 */
function resolveReminderConfig(reminder: ReminderConfig | undefined): ResolvedReminderConfig | null {
  if (!reminder) return null;
  // 核心字段缺失则视为未启用催办
  if (reminder.intervalMinutes == null || reminder.maxReminders == null) {
    log.warn('催办配置不完整，跳过该节点', { reminder });
    return null;
  }
  return {
    firstReminderDelayMinutes: reminder.firstReminderDelayMinutes ?? 0,
    intervalMinutes: reminder.intervalMinutes,
    maxReminders: reminder.maxReminders,
    ccSupervisorAfterCount: reminder.ccSupervisorAfterCount ?? 0,
  };
}

// =====================================================
// 工具函数
// =====================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
