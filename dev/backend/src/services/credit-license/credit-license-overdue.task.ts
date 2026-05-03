/**
 * 客户授信营业执照 - 逾期标记定时任务
 * 将超过截止日期的 pending/reminded 记录标记为 overdue
 * @module services/credit-license/credit-license-overdue.task
 */

import * as repository from './credit-license.repository';

/**
 * 标记所有逾期未补交的记录为 overdue
 * 每天 09:15 执行（在考核计算之前）
 *
 * @returns 标记的记录数
 */
export async function markOverdueDeferredUploads(): Promise<number> {
  console.log('[CreditLicenseOverdue] 开始标记逾期记录...');

  try {
    const count = await repository.markOverdueBatch();
    console.log(`[CreditLicenseOverdue] 标记完成，${count} 条记录标记为逾期`);
    return count;
  } catch (error) {
    console.error('[CreditLicenseOverdue] 标记失败:', error);
    return 0;
  }
}
