/**
 * 退货考核通知模板
 * 使用 Markdown 格式，无按钮，保持简洁通知风格
 */

import type { PenaltyRecord } from '../../../return-penalty/return-penalty.types';

/** 考核类型名称映射 */
const PENALTY_TYPE_NAMES: Record<string, string> = {
  warehouse_delay: '仓储执行超时',
  erp_fill_delay: 'ERP填写超时',
  confirm_delay: '确认超时',
  sales_delay: '销售超时',
};

/**
 * 格式化时间戳
 */
function formatTimestamp(): string {
  return new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
}

/**
 * 构建考核通知消息（Markdown 格式）
 */
export function buildPenaltyNoticeMessage(
  userName: string,
  penalties: PenaltyRecord[]
): { title: string; content: string } {
  // 生成表格行
  const penaltyRows = penalties.map(p => {
    const typeName = PENALTY_TYPE_NAMES[p.penaltyType] || p.penaltyType;
    return `| ${typeName} | ${p.returnNo || '-'} | ${p.goodsName || '-'} | ${p.overdueDays || '-'} | ¥${p.penaltyAmount.toFixed(2)} |`;
  }).join('\n');

  const title = '退货考核通知';

  const content = `### 退货考核通知

${userName}：

您有以下退货考核记录：

| 考核类型 | 退货单号 | 商品名称 | 超时天数 | 考核金额 |
|----------|----------|----------|----------|----------|
${penaltyRows}

请及时处理相关退货任务，避免更多考核。

---
推送时间：${formatTimestamp()}`;

  return { title, content };
}

/**
 * 构建批量考核通知消息
 * 按用户分组
 */
export function buildBatchPenaltyNoticeMessages(
  penalties: PenaltyRecord[]
): Map<number, { userName: string; title: string; content: string }> {
  const result = new Map<number, { userName: string; title: string; content: string }>();

  // 按用户分组
  const userPenaltiesMap = new Map<number, PenaltyRecord[]>();
  for (const penalty of penalties) {
    const existing = userPenaltiesMap.get(penalty.penaltyUserId) || [];
    existing.push(penalty);
    userPenaltiesMap.set(penalty.penaltyUserId, existing);
  }

  // 构建每个用户的消息
  for (const [userId, userPenalties] of userPenaltiesMap) {
    const userName = userPenalties[0].penaltyUserName;
    const message = buildPenaltyNoticeMessage(userName, userPenalties);
    result.set(userId, { userName, ...message });
  }

  return result;
}
