/**
 * 客户授信营业执照 - 补交提醒定时任务
 * 第3天和第6天各发一次钉钉提醒
 * @module services/credit-license/credit-license-reminder.task
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('CreditLicense');

import * as repository from './credit-license.repository';
import { getDingtalkUserIdMap } from '../assessment/utils';
import { sendWorkNotification } from '../dingtalk.service';
import {
  CREDIT_LICENSE_DEFERRED_DEADLINE_DAYS,
  CREDIT_LICENSE_REMINDER_DAY_OFFSET_1,
  CREDIT_LICENSE_REMINDER_DAY_OFFSET_2,
  CREDIT_LICENSE_PENALTY_PER_DAY,
} from '../../utils/constants';

/**
 * 检查并发送营业执照补交提醒
 * 每天 09:00 执行
 *
 * 提醒逻辑：
 * - 第3天提醒: deadline 距今还有 (7-3)=4 天 → deadline = CURRENT_DATE + 4天
 * - 第6天提醒: deadline 距今还有 (7-6)=1 天 → deadline = CURRENT_DATE + 1天
 */
export async function checkLicenseDeferredReminders(): Promise<void> {
  log.info('开始检查营业执照补交提醒...');

  try {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // 计算两组提醒的目标 deadline 范围
    const offset1Days =
      CREDIT_LICENSE_DEFERRED_DEADLINE_DAYS - CREDIT_LICENSE_REMINDER_DAY_OFFSET_1;
    const offset2Days =
      CREDIT_LICENSE_DEFERRED_DEADLINE_DAYS - CREDIT_LICENSE_REMINDER_DAY_OFFSET_2;

    const day1Start = new Date(now);
    day1Start.setDate(day1Start.getDate() + offset1Days);
    const day1End = new Date(day1Start);
    day1End.setHours(23, 59, 59, 999);

    const day2Start = new Date(now);
    day2Start.setDate(day2Start.getDate() + offset2Days);
    const day2End = new Date(day2Start);
    day2End.setHours(23, 59, 59, 999);

    // 查询两组提醒记录
    const [records1, records2] = await Promise.all([
      repository.getPendingReminders(day1Start, day1End),
      repository.getPendingReminders(day2Start, day2End),
    ]);

    let sentCount = 0;

    // 第3天提醒
    for (const record of records1) {
      try {
        await sendReminderNotification(record, CREDIT_LICENSE_REMINDER_DAY_OFFSET_1, offset1Days);
        await repository.updateStatus(record.id, 'reminded', {
          last_reminder_at: new Date().toISOString(),
        });
        sentCount++;
      } catch (error) {
        log.error(`第3天提醒发送失败(id=${record.id}):`, error);
      }
    }

    // 第6天提醒（到期前1天）
    for (const record of records2) {
      try {
        await sendReminderNotification(record, CREDIT_LICENSE_REMINDER_DAY_OFFSET_2, offset2Days);
        await repository.updateStatus(record.id, 'reminded', {
          last_reminder_at: new Date().toISOString(),
        });
        sentCount++;
      } catch (error) {
        log.error(`第6天提醒发送失败(id=${record.id}):`, error);
      }
    }

    log.info(`检查完成，发送 ${sentCount} 条提醒`);
  } catch (error) {
    log.error('检查失败:', error);
  }
}

/**
 * 发送单条提醒通知（钉钉）
 */
async function sendReminderNotification(
  record: {
    id: number;
    oa_instance_id: number;
    customer_name: string | null;
    applicant_id: number;
    deadline: string;
  },
  remindDay: number,
  remainingDays: number
): Promise<void> {
  const customerName = record.customer_name || '未知客户';
  const deadlineStr = new Date(record.deadline).toLocaleDateString('zh-CN');
  const isLastDay = remainingDays <= 1;

  const title = isLastDay
    ? `【营业执照补交最后提醒】客户 ${customerName}`
    : `【营业执照补交提醒】客户 ${customerName}`;

  const markdown = isLastDay
    ? `### 营业执照补交最后提醒\n\n客户 **${customerName}** 的营业执照明天到期！\n\n- 截止日期：${deadlineStr}\n- 剩余天数：1天\n- 逾期后将按 ${CREDIT_LICENSE_PENALTY_PER_DAY}元/天 自动考核\n\n请尽快上传！`
    : `### 营业执照补交提醒\n\n您为客户 **${customerName}** 提交的授信申请未上传营业执照。\n\n- 截止日期：${deadlineStr}\n- 剩余天数：${remainingDays}天\n- 逾期考核：${CREDIT_LICENSE_PENALTY_PER_DAY}元/天\n\n请于截止日期前补交。`;

  // 1. 发送钉钉通知
  try {
    const dingtalkMap = await getDingtalkUserIdMap([record.applicant_id]);
    const dingtalkUserId = dingtalkMap.get(record.applicant_id);
    if (dingtalkUserId) {
      await sendWorkNotification([dingtalkUserId], title, markdown);
    }
  } catch (error) {
    log.warn('钉钉通知发送失败:', error);
  }
}
