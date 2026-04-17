/**
 * 每日退货提醒模板
 * 使用 ActionCard 格式，单个「查看列表」按钮
 */

import { ActionCardBuilder } from '../../builders/action-card.builder';
import type { ActionCardContent } from '../../dingtalk.types';
import type { ReturnOrder } from '../../../return-order/return-order.types';

const ACTION_URL = 'https://xly.gzzxd.com/procurement/return/orders';

/**
 * 格式化时间戳
 */
function formatTimestamp(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 构建每日新增临期退货提醒消息（ActionCard 格式）
 */
export function buildDailyNewReturnMessage(
  orders: ReturnOrder[],
  userNames: string[] = []
): { title: string; actionCard: ActionCardContent } {
  const greeting = userNames.length > 0 ? `${userNames.join('、')}：` : '您好：';

  // 格式化日期
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // 构建表格内容
  const tableRows = orders.slice(0, 10).map(order =>
    `| ${order.returnNo} | ${order.goodsName} | ${order.quantity}${order.unit || ''} | ${order.daysToExpire}天 |`
  ).join('\n');

  const moreText = orders.length > 10 ? `\n*...还有 ${orders.length - 10} 条*` : '';

  const title = `【临期退货】您有 ${orders.length} 条临期退货入库待确认是否可以采购退货`;

  const markdown = `### 临期退货提醒

${greeting}

今日（${dateStr}）共新增 ${orders.length} 条临期退货入库，现需要您确认是否可以采购退货：

| 退货单号 | 商品名称 | 数量 | 剩余保质期 |
|----------|----------|------|------------|
${tableRows}${moreText}

请及时确认是否可以采购退货！

---
推送时间：${formatTimestamp()}`;

  const actionCard = new ActionCardBuilder()
    .setTitle(title)
    .setMarkdown(markdown)
    .setSingleUrl(ACTION_URL, '查看列表')
    .build();

  return { title, actionCard };
}

/**
 * 构建每日待填ERP退货单提醒消息（ActionCard 格式）
 */
export function buildPendingErpMessage(
  orders: ReturnOrder[],
  userNames: string[] = []
): { title: string; actionCard: ActionCardContent } {
  const greeting = userNames.length > 0 ? `${userNames.join('、')}：` : '您好：';

  // 格式化确认时间
  const formatDateShort = (date: Date | string): string => {
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${month}-${day} ${hours}:${minutes}`;
  };

  // 构建表格内容
  const tableRows = orders.slice(0, 10).map(order => {
    const confirmedAt = order.updatedAt ? formatDateShort(order.updatedAt) : '-';
    return `| ${order.returnNo} | ${order.goodsName} | ${order.quantity}${order.unit || ''} | ${confirmedAt} |`;
  }).join('\n');

  const moreText = orders.length > 10 ? `\n*...还有 ${orders.length - 10} 条*` : '';

  const title = `【待填写】您有 ${orders.length} 条退货单待填写ERP采购退货单号`;

  const markdown = `### 待填写ERP退货单号提醒

${greeting}

以下退货单已确认可采购退货，但尚未填写ERP采购退货单号：

| 退货单号 | 商品名称 | 数量 | 确认时间 |
|----------|----------|------|----------|
${tableRows}${moreText}

请尽快填写ERP采购退货单号！

---
推送时间：${formatTimestamp()}`;

  const actionCard = new ActionCardBuilder()
    .setTitle(title)
    .setMarkdown(markdown)
    .setSingleUrl(ACTION_URL, '查看列表')
    .build();

  return { title, actionCard };
}

/**
 * 构建无法采购退货通知消息（ActionCard 格式）
 */
export function buildCannotPurchaseReturnMessage(
  order: ReturnOrder
): { title: string; actionCard: ActionCardContent } {
  const title = `【临期商品】您有 1 条临期退货无法采购退货，请尽快销售`;

  const markdown = `### 临期退货无法采购退货通知

${order.marketingManager || '您好'}：

以下临期退货商品已确认无法采购退货，请您尽快寻找渠道销售：

| 退货单号 | 商品名称 | 数量 | 剩余保质期 | 来源客户 |
|----------|----------|------|------------|----------|
| ${order.returnNo} | ${order.goodsName} | ${order.quantity}${order.unit || ''} | ${order.daysToExpire}天 | ${order.consumerName || '-'} |

⚠️ 重要提醒：若商品在过期前无法完成销售，将执行考核。

请尽快处理！

---
推送时间：${formatTimestamp()}`;

  const actionCard = new ActionCardBuilder()
    .setTitle(title)
    .setMarkdown(markdown)
    .setSingleUrl(ACTION_URL, '查看详情')
    .build();

  return { title, actionCard };
}

/**
 * 构建待仓储执行通知消息（ActionCard 格式）
 */
export function buildPendingWarehouseExecuteMessage(
  order: ReturnOrder,
  erpReturnNo: string,
  userNames: string[] = []
): { title: string; actionCard: ActionCardContent } {
  const greeting = userNames.length > 0 ? `${userNames.join('、')}：` : '您好：';

  const title = `【待退货】您有 1 条临期退货待执行，请尽快安排`;

  const markdown = `### 待仓储退货通知

${greeting}

以下临期退货商品已填写ERP采购退货单，请尽快安排商品退出，并录入退货情况：

| 退货单号 | 商品名称 | 数量 | ERP退货单号 | 剩余保质期 |
|----------|----------|------|------------|------------|
| ${order.returnNo} | ${order.goodsName} | ${order.quantity}${order.unit || ''} | ${erpReturnNo} | ${order.daysToExpire}天 |

请及时安排退货，并在系统中录入退货情况！

---
推送时间：${formatTimestamp()}`;

  const actionCard = new ActionCardBuilder()
    .setTitle(title)
    .setMarkdown(markdown)
    .setSingleUrl(ACTION_URL, '查看详情')
    .build();

  return { title, actionCard };
}
