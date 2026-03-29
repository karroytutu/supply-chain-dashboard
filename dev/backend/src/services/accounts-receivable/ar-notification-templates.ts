/**
 * 应收账款通知消息模板
 * 包含11种通知类型的消息构建函数
 */

/** 单据明细接口 */
export interface BillDetail {
  billNo: string;        // erp_bill_id
  amount: number;        // left_amount
  dueDate?: string;      // due_date 格式化
  overdueDays?: number;  // 逾期天数
  penaltyAmount?: number; // 考核金额
  payDate?: string;      // latest_pay_date 格式化
  origAmount?: number;   // total_amount
}

/** 每日汇总统计 */
export interface DailySummaryStats {
  totalAmount: number;       // 应收总额
  overdueAmount: number;     // 逾期总额
  newOverdueToday: number;   // 今日新增逾期
  collectingCount: number;   // 催收中数量
  pendingReviewCount: number; // 待审核数量
  resolvedToday: number;     // 今日已解决金额
  penaltyTotal: number;      // 考核总额
}

/** 系统基础URL */
const SYSTEM_BASE_URL = process.env.SYSTEM_BASE_URL || 'http://localhost:3100';

/**
 * 格式化金额显示
 */
function formatAmount(amount: number): string {
  return `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * 格式化日期时间
 */
function formatDateTime(date?: Date): string {
  if (!date) return '-';
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

/**
 * 格式化日期
 */
function formatDate(date?: Date | string): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 获取当前时间戳
 */
function getTimestamp(): string {
  return formatDateTime(new Date());
}

/**
 * 构建单据明细列表
 */
function buildBillList(bills: BillDetail[], showOverdueDays = false, showPenalty = false): string {
  if (!bills || bills.length === 0) return '';

  let content = '| 单据号 | 金额 | 到期日';
  if (showOverdueDays) content += ' | 逾期天数';
  if (showPenalty) content += ' | 考核金额';
  content += ' |\n';

  content += '|:---|---:|:---';
  if (showOverdueDays) content += '|:---';
  if (showPenalty) content += '|---:';
  content += '|\n';

  for (const bill of bills) {
    content += `| ${bill.billNo} | ${formatAmount(bill.amount)} | ${bill.dueDate || '-'}`;
    if (showOverdueDays) content += ` | ${bill.overdueDays || 0}天`;
    if (showPenalty) content += ` | ${formatAmount(bill.penaltyAmount || 0)}`;
    content += ' |\n';
  }

  return content;
}

/**
 * 模板1: 逾期前5天预警
 * 发送给营销师，提醒即将到期的应收账款
 */
export function buildPreWarn5Message(
  consumerName: string,
  settleMethod: string,
  bills: BillDetail[]
): string {
  const totalAmount = bills.reduce((sum, b) => sum + b.amount, 0);

  let content = `## 📅 即将到期预警（前5天）\n\n`;
  content += `**客户名称**: ${consumerName}\n`;
  content += `**结算方式**: ${settleMethod}\n`;
  content += `**涉及单据**: ${bills.length}张\n`;
  content += `**应收总额**: ${formatAmount(totalAmount)}\n\n`;
  content += `### 单据明细\n\n`;
  content += buildBillList(bills);
  content += `\n> 请及时跟进客户付款进度，避免逾期。\n\n`;
  content += `[查看详情](${SYSTEM_BASE_URL}/finance/ar/overview)\n\n`;
  content += `---\n推送时间: ${getTimestamp()}`;

  return content;
}

/**
 * 模板2: 逾期前2天紧急预警
 * 发送给营销师，紧急提醒即将到期的应收账款
 */
export function buildPreWarn2Message(
  consumerName: string,
  bills: BillDetail[]
): string {
  const totalAmount = bills.reduce((sum, b) => sum + b.amount, 0);

  let content = `## ⚠️ 紧急预警（前2天）\n\n`;
  content += `**客户名称**: ${consumerName}\n`;
  content += `**涉及单据**: ${bills.length}张\n`;
  content += `**应收总额**: ${formatAmount(totalAmount)}\n\n`;
  content += `### 单据明细\n\n`;
  content += buildBillList(bills);
  content += `\n> ⚠️ 即将逾期，请务必立即跟进！\n\n`;
  content += `[立即处理](${SYSTEM_BASE_URL}/finance/ar/workspace)\n\n`;
  content += `---\n推送时间: ${getTimestamp()}`;

  return content;
}

/**
 * 模板3: 逾期催收通知
 * 发送给催收人，告知已逾期并需开始催收
 */
export function buildOverdueCollectMessage(
  consumerName: string,
  deadlineDate: string,
  bills: BillDetail[]
): string {
  const totalAmount = bills.reduce((sum, b) => sum + b.amount, 0);

  let content = `## 🔴 逾期催收通知\n\n`;
  content += `**客户名称**: ${consumerName}\n`;
  content += `**涉及单据**: ${bills.length}张\n`;
  content += `**应收总额**: ${formatAmount(totalAmount)}\n`;
  content += `**催收截止**: ${deadlineDate}\n\n`;
  content += `### 单据明细\n\n`;
  content += buildBillList(bills, true);
  content += `\n> 请在规定期限内完成催收，超时将触发考核。\n\n`;
  content += `[立即处理](${SYSTEM_BASE_URL}/finance/ar/workspace)\n\n`;
  content += `---\n推送时间: ${getTimestamp()}`;

  return content;
}

/**
 * 模板4: 催收超时考核
 * 发送给催收人，告知因超时被考核
 */
export function buildTimeoutPenaltyMessage(
  consumerName: string,
  timeoutDays: number,
  totalPenalty: number,
  bills: BillDetail[]
): string {
  const billsWithPenalty = bills.map(b => ({
    ...b,
    penaltyAmount: b.penaltyAmount || 0
  }));

  let content = `## 💰 催收超时考核\n\n`;
  content += `**客户名称**: ${consumerName}\n`;
  content += `**超时天数**: ${timeoutDays}天\n`;
  content += `**考核总额**: ${formatAmount(totalPenalty)}\n\n`;
  content += `### 考核明细\n\n`;
  content += buildBillList(billsWithPenalty, true, true);
  content += `\n> 由于催收超时，已触发考核机制。\n\n`;
  content += `[查看详情](${SYSTEM_BASE_URL}/finance/ar/overview)\n\n`;
  content += `---\n推送时间: ${getTimestamp()}`;

  return content;
}

/**
 * 模板5: 催收升级通知
 * 发送给新催收人，告知催收任务已升级
 */
export function buildEscalateMessage(
  consumerName: string,
  overdueDays: number,
  reason: string,
  previousCollector: string,
  bills: BillDetail[]
): string {
  const totalAmount = bills.reduce((sum, b) => sum + b.amount, 0);

  let content = `## ⬆️ 催收升级通知\n\n`;
  content += `**客户名称**: ${consumerName}\n`;
  content += `**逾期天数**: ${overdueDays}天\n`;
  content += `**应收总额**: ${formatAmount(totalAmount)}\n`;
  content += `**升级原因**: ${reason}\n`;
  content += `**原催收人**: ${previousCollector}\n\n`;
  content += `### 单据明细\n\n`;
  content += buildBillList(bills, true);
  content += `\n> 该客户的催收任务已升级至您，请及时处理。\n\n`;
  content += `[立即处理](${SYSTEM_BASE_URL}/finance/ar/workspace)\n\n`;
  content += `---\n推送时间: ${getTimestamp()}`;

  return content;
}

/**
 * 模板6: 延期到期自动升级
 * 发送给新催收人，告知延期已到期自动升级
 */
export function buildAutoEscalateMessage(
  consumerName: string,
  delayType: string,
  latestPayDate: string,
  previousCollector: string,
  bills: BillDetail[]
): string {
  const totalAmount = bills.reduce((sum, b) => sum + b.amount, 0);
  const delayTypeText = delayType === 'customer_delay' ? '客户延期' : '营销担保延期';

  let content = `## 🔄 延期到期自动升级\n\n`;
  content += `**客户名称**: ${consumerName}\n`;
  content += `**延期类型**: ${delayTypeText}\n`;
  content += `**承诺付款日**: ${latestPayDate}\n`;
  content += `**应收总额**: ${formatAmount(totalAmount)}\n`;
  content += `**原催收人**: ${previousCollector}\n\n`;
  content += `### 单据明细\n\n`;
  content += buildBillList(bills, true);
  content += `\n> 该客户延期已到期但未付款，已自动升级至您处理。\n\n`;
  content += `[立即处理](${SYSTEM_BASE_URL}/finance/ar/workspace)\n\n`;
  content += `---\n推送时间: ${getTimestamp()}`;

  return content;
}

/**
 * 模板7: 待审核通知
 * 发送给审核人，告知有待审核的催收结果
 */
export function buildPendingReviewMessage(
  reviewType: string,
  collectorName: string,
  consumerName: string,
  bills: BillDetail[]
): string {
  const totalAmount = bills.reduce((sum, b) => sum + b.amount, 0);
  const reviewTypeText = reviewType === 'customer_delay' ? '客户延期' :
                         reviewType === 'guarantee_delay' ? '营销担保延期' :
                         reviewType === 'paid_off' ? '回款确认' : '催收升级';

  let content = `## 📋 待审核通知\n\n`;
  content += `**审核类型**: ${reviewTypeText}\n`;
  content += `**客户名称**: ${consumerName}\n`;
  content += `**催收人**: ${collectorName}\n`;
  content += `**涉及金额**: ${formatAmount(totalAmount)}\n\n`;
  content += `### 单据明细\n\n`;
  content += buildBillList(bills);
  content += `\n> 请及时审核该催收结果。\n\n`;
  content += `[前往审核](${SYSTEM_BASE_URL}/finance/ar/workspace?tab=review)\n\n`;
  content += `---\n推送时间: ${getTimestamp()}`;

  return content;
}

/**
 * 模板8: 审核结果通知
 * 发送给催收人，告知审核结果
 */
export function buildReviewResultMessage(
  consumerName: string,
  reviewType: string,
  approved: boolean,
  reviewerName: string,
  rejectComment: string | null,
  bills: BillDetail[]
): string {
  const totalAmount = bills.reduce((sum, b) => sum + b.amount, 0);
  const reviewTypeText = reviewType === 'customer_delay' ? '客户延期' :
                         reviewType === 'guarantee_delay' ? '营销担保延期' :
                         reviewType === 'paid_off' ? '回款确认' : '催收升级';
  const statusIcon = approved ? '✅' : '❌';
  const statusText = approved ? '已通过' : '已驳回';

  let content = `## ${statusIcon} 审核结果通知\n\n`;
  content += `**客户名称**: ${consumerName}\n`;
  content += `**审核类型**: ${reviewTypeText}\n`;
  content += `**审核结果**: ${statusText}\n`;
  content += `**审核人**: ${reviewerName}\n`;
  content += `**涉及金额**: ${formatAmount(totalAmount)}\n`;

  if (!approved && rejectComment) {
    content += `**驳回原因**: ${rejectComment}\n`;
  }

  content += `\n### 单据明细\n\n`;
  content += buildBillList(bills);

  if (!approved) {
    content += `\n> 请根据审核意见重新处理。\n\n`;
    content += `[重新处理](${SYSTEM_BASE_URL}/finance/ar/workspace)\n\n`;
  } else {
    content += `\n> 审核已通过。\n\n`;
  }

  content += `---\n推送时间: ${getTimestamp()}`;

  return content;
}

/**
 * 模板9: 回款确认成功
 * 发送给催收人，告知回款已被确认
 */
export function buildPaymentConfirmedMessage(
  consumerName: string,
  cashierName: string,
  bills: BillDetail[]
): string {
  const totalAmount = bills.reduce((sum, b) => sum + b.amount, 0);

  let content = `## ✅ 回款确认成功\n\n`;
  content += `**客户名称**: ${consumerName}\n`;
  content += `**确认人**: ${cashierName}（出纳）\n`;
  content += `**回款金额**: ${formatAmount(totalAmount)}\n\n`;
  content += `### 单据明细\n\n`;
  content += buildBillList(bills);
  content += `\n> 该客户的回款已确认到账。\n\n`;
  content += `[查看详情](${SYSTEM_BASE_URL}/finance/ar/overview)\n\n`;
  content += `---\n推送时间: ${getTimestamp()}`;

  return content;
}

/**
 * 模板10: 营销担保延期生效
 * 发送给营销师和主管，告知担保延期已生效
 */
export function buildGuaranteeNotifyMessage(
  consumerName: string,
  collectorName: string,
  latestPayDate: string,
  bills: BillDetail[]
): string {
  const totalAmount = bills.reduce((sum, b) => sum + b.amount, 0);

  let content = `## 📝 营销担保延期生效\n\n`;
  content += `**客户名称**: ${consumerName}\n`;
  content += `**担保人**: ${collectorName}\n`;
  content += `**承诺付款日**: ${latestPayDate}\n`;
  content += `**担保金额**: ${formatAmount(totalAmount)}\n\n`;
  content += `### 单据明细\n\n`;
  content += buildBillList(bills);
  content += `\n> 若到期未付款，将自动升级处理，并由担保人承担相应责任。\n\n`;
  content += `[查看详情](${SYSTEM_BASE_URL}/finance/ar/overview)\n\n`;
  content += `---\n推送时间: ${getTimestamp()}`;

  return content;
}

/**
 * 模板11: 每日催收进度汇总
 * 发送给管理员，汇总当日催收情况
 */
export function buildDailySummaryMessage(stats: DailySummaryStats): string {
  let content = `## 📊 每日催收进度汇总\n\n`;
  content += `### 应收账款概览\n\n`;
  content += `| 指标 | 金额/数量 |\n`;
  content += `|:---|---:|\n`;
  content += `| 应收总额 | ${formatAmount(stats.totalAmount)} |\n`;
  content += `| 逾期总额 | ${formatAmount(stats.overdueAmount)} |\n`;
  content += `| 今日新增逾期 | ${formatAmount(stats.newOverdueToday)} |\n`;
  content += `| 今日已解决 | ${formatAmount(stats.resolvedToday)} |\n\n`;

  content += `### 催收进度\n\n`;
  content += `| 指标 | 数量 |\n`;
  content += `|:---|---:|\n`;
  content += `| 催收中 | ${stats.collectingCount} |\n`;
  content += `| 待审核 | ${stats.pendingReviewCount} |\n\n`;

  content += `### 考核情况\n\n`;
  content += `| 指标 | 金额 |\n`;
  content += `|:---|---:|\n`;
  content += `| 累计考核金额 | ${formatAmount(stats.penaltyTotal)} |\n\n`;

  content += `[查看详情](${SYSTEM_BASE_URL}/finance/ar/overview)\n\n`;
  content += `---\n推送时间: ${getTimestamp()}`;

  return content;
}

/**
 * 获取通知标题
 */
export function getNotificationTitle(type: string, consumerName?: string): string {
  const titles: Record<string, string> = {
    'pre_warn_5': '📅 即将到期预警',
    'pre_warn_2': '⚠️ 紧急预警',
    'overdue_collect': '🔴 逾期催收通知',
    'timeout_penalty': '💰 催收超时考核',
    'escalate': '⬆️ 催收升级通知',
    'auto_escalate': '🔄 延期到期自动升级',
    'pending_review': '📋 待审核通知',
    'review_result': '📝 审核结果通知',
    'payment_confirmed': '✅ 回款确认成功',
    'guarantee_notify': '📝 营销担保延期生效',
    'daily_summary': '📊 每日催收进度汇总',
  };
  return titles[type] || '应收账款通知';
}
