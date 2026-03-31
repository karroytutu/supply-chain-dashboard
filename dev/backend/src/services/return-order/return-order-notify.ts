/**
 * 退货单钉钉通知服务
 * 处理退货单各节点的钉钉工作通知推送
 */

import { appQuery } from '../../db/appPool';
import { sendWorkNotification } from '../dingtalk.service';
import type { ReturnOrder, ReturnOrderStatus } from './return-order.types';

/**
 * 根据角色代码获取用户的 dingtalk_user_id 列表
 */
async function getDingtalkUserIdsByRole(roleCode: string): Promise<string[]> {
  try {
    const result = await appQuery<{ dingtalk_user_id: string }>(
      `SELECT u.dingtalk_user_id 
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.code = $1 AND u.status = 1 AND r.status = 1`,
      [roleCode]
    );
    return result.rows.map(row => row.dingtalk_user_id).filter(id => id && id !== 'dev_admin');
  } catch (error) {
    console.error('[DingTalk] 获取角色用户失败:', roleCode, error);
    return [];
  }
}

/**
 * 根据用户姓名获取 dingtalk_user_id
 * 用于根据责任营销师姓名找到对应的钉钉ID
 */
async function getDingtalkUserIdByName(userName: string): Promise<string | null> {
  try {
    const result = await appQuery<{ dingtalk_user_id: string }>(
      'SELECT dingtalk_user_id FROM users WHERE name = $1 AND status = 1 LIMIT 1',
      [userName]
    );
    if (result.rows.length === 0) return null;
    const dingtalkId = result.rows[0].dingtalk_user_id;
    return dingtalkId === 'dev_admin' ? null : dingtalkId;
  } catch (error) {
    console.error('[DingTalk] 根据姓名获取用户钉钉ID失败:', userName, error);
    return null;
  }
}

/**
 * 根据用户ID获取 dingtalk_user_id
 */
async function getDingtalkUserIdByUserId(userId: number): Promise<string | null> {
  try {
    const result = await appQuery<{ dingtalk_user_id: string }>(
      'SELECT dingtalk_user_id FROM users WHERE id = $1 AND status = 1',
      [userId]
    );
    if (result.rows.length === 0) return null;
    const dingtalkId = result.rows[0].dingtalk_user_id;
    return dingtalkId === 'dev_admin' ? null : dingtalkId;
  } catch (error) {
    console.error('[DingTalk] 获取用户钉钉ID失败:', userId, error);
    return null;
  }
}

/**
 * 获取用户姓名列表（根据角色）
 */
async function getUserNamesByRole(roleCode: string): Promise<string[]> {
  try {
    const result = await appQuery<{ name: string }>(
      `SELECT u.name 
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE r.code = $1 AND u.status = 1 AND r.status = 1`,
      [roleCode]
    );
    return result.rows.map(row => row.name);
  } catch (error) {
    console.error('[DingTalk] 获取角色用户姓名失败:', roleCode, error);
    return [];
  }
}

/**
 * 获取状态中文文本
 */
function getStatusText(status: ReturnOrderStatus): string {
  const statusMap: Record<ReturnOrderStatus, string> = {
    'pending_confirm': '待确认',
    'pending_erp_fill': '待填写ERP退货单号',
    'pending_warehouse_execute': '待仓储执行',
    'pending_marketing_sale': '待营销销售处理',
    'completed': '已完成',
    'cancelled': '已取消',
  };
  return statusMap[status] || status;
}

/**
 * 格式化时间戳
 */
function formatTimestamp(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 格式化日期（简短格式）
 */
function formatDateShort(date: Date | string): string {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
}

// 操作链接
const ACTION_URL = 'https://xly.gzzxd.com/procurement/return/orders';

// ============================================================
// 批量推送函数（定时任务调用）
// ============================================================

/**
 * 批量通知：每日新增临期退货提醒
 * 推送对象：采购主管
 * 推送时机：每天 08:30 同步后
 */
export async function sendDailyNewReturnReminder(orders: ReturnOrder[]): Promise<void> {
  try {
    if (!orders || orders.length === 0) {
      console.log('[DingTalk] 无新增临期退货，跳过推送');
      return;
    }

    console.log(`[DingTalk] 准备发送每日新增临期退货提醒，共 ${orders.length} 条`);

    // 获取采购主管
    const userIdList = await getDingtalkUserIdsByRole('procurement_manager');
    if (userIdList.length === 0) {
      console.log('[DingTalk] 没有采购主管，跳过推送');
      return;
    }

    // 获取采购主管姓名（用于称呼）
    const userNames = await getUserNamesByRole('procurement_manager');
    const greeting = userNames.length > 0 ? `${userNames.join('、')}：` : '您好：';

    // 格式化日期
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // 构建表格内容
    const tableRows = orders.map(order => 
      `| ${order.returnNo} | ${order.goodsName} | ${order.quantity}${order.unit || ''} | ${order.daysToExpire}天 |`
    ).join('\n');

    const title = `【临期退货】您有 ${orders.length} 条临期退货入库待确认是否可以采购退货`;
    const content = `### 临期退货提醒

${greeting}

今日（${dateStr}）共新增 ${orders.length} 条临期退货入库，现需要您确认是否可以采购退货：

| 退货单号 | 商品名称 | 数量 | 剩余保质期 |
|----------|----------|------|------------|
${tableRows}

请及时确认是否可以采购退货！

---
点击查看详情: ${ACTION_URL}

推送时间：${formatTimestamp()}`;

    const result = await sendWorkNotification(userIdList, title, content);
    console.log('[DingTalk] 每日新增临期退货提醒发送结果:', result);
  } catch (error) {
    console.error('[DingTalk] 每日新增临期退货提醒发送失败:', error);
  }
}

/**
 * 批量通知：每日待填ERP退货单提醒
 * 推送对象：采购主管
 * 推送时机：每天 08:35
 */
export async function sendDailyPendingErpReminder(orders: ReturnOrder[]): Promise<void> {
  try {
    if (!orders || orders.length === 0) {
      console.log('[DingTalk] 无待填ERP退货单，跳过推送');
      return;
    }

    console.log(`[DingTalk] 准备发送每日待填ERP退货单提醒，共 ${orders.length} 条`);

    // 获取采购主管
    const userIdList = await getDingtalkUserIdsByRole('procurement_manager');
    if (userIdList.length === 0) {
      console.log('[DingTalk] 没有采购主管，跳过推送');
      return;
    }

    // 获取采购主管姓名（用于称呼）
    const userNames = await getUserNamesByRole('procurement_manager');
    const greeting = userNames.length > 0 ? `${userNames.join('、')}：` : '您好：';

    // 构建表格内容
    const tableRows = orders.map(order => {
      const confirmedAt = order.updatedAt ? formatDateShort(order.updatedAt) : '-';
      return `| ${order.returnNo} | ${order.goodsName} | ${order.quantity}${order.unit || ''} | ${confirmedAt} |`;
    }).join('\n');

    const title = `【待填写】您有 ${orders.length} 条退货单待填写ERP采购退货单号`;
    const content = `### 待填写ERP退货单号提醒

${greeting}

以下退货单已确认可采购退货，但尚未填写ERP采购退货单号：

| 退货单号 | 商品名称 | 数量 | 确认时间 |
|----------|----------|------|----------|
${tableRows}

请尽快填写ERP采购退货单号！

---
点击填写: ${ACTION_URL}

推送时间：${formatTimestamp()}`;

    const result = await sendWorkNotification(userIdList, title, content);
    console.log('[DingTalk] 每日待填ERP退货单提醒发送结果:', result);
  } catch (error) {
    console.error('[DingTalk] 每日待填ERP退货单提醒发送失败:', error);
  }
}

// ============================================================
// 单条通知函数（业务流程触发）
// ============================================================

/**
 * 构建退货单基础信息文本
 */
function buildOrderInfoMarkdown(order: ReturnOrder): string {
  return `**退货单号：** ${order.returnNo}  
**商品名称：** ${order.goodsName}  
**商品编码：** ${order.goodsId}  
**退货数量：** ${order.quantity} ${order.unit || ''}  
**客户名称：** ${order.consumerName || '-'}  
**责任营销师：** ${order.marketingManager || '-'}  
**当前状态：** ${getStatusText(order.status)}`;
}

/**
 * 通知：无法采购退货（需营销销售处理）
 * 接收者：责任营销师（具体人员）
 * 推送时机：采购主管确认为不可退货时
 */
export async function notifyCannotPurchaseReturn(order: ReturnOrder): Promise<void> {
  try {
    console.log('[DingTalk] 准备发送无法采购退货通知:', order.returnNo);

    // 根据责任营销师姓名获取具体用户
    const userIdList: string[] = [];
    
    if (order.marketingManager) {
      const dingtalkId = await getDingtalkUserIdByName(order.marketingManager);
      if (dingtalkId) {
        userIdList.push(dingtalkId);
      } else {
        console.warn(`[DingTalk] 未找到责任营销师 ${order.marketingManager} 的钉钉ID`);
      }
    }

    if (userIdList.length === 0) {
      console.log('[DingTalk] 没有可用的通知接收者');
      return;
    }

    const title = `【临期商品】您有 1 条临期退货无法采购退货，请尽快销售`;
    const content = `### 临期退货无法采购退货通知

${order.marketingManager}：

以下临期退货商品已确认无法采购退货，请您尽快寻找渠道销售：

| 退货单号 | 商品名称 | 数量 | 剩余保质期 | 来源客户 |
|----------|----------|------|------------|----------|
| ${order.returnNo} | ${order.goodsName} | ${order.quantity}${order.unit || ''} | ${order.daysToExpire}天 | ${order.consumerName || '-'} |

⚠️ 重要提醒：若商品在过期前无法完成销售，将执行考核。

请尽快处理！

---
点击查看详情: ${ACTION_URL}

推送时间：${formatTimestamp()}`;

    const result = await sendWorkNotification(userIdList, title, content);
    console.log('[DingTalk] 无法采购退货通知发送结果:', result);
  } catch (error) {
    console.error('[DingTalk] 无法采购退货通知发送失败:', error);
  }
}

/**
 * 通知：ERP退货单号已填写，待仓储执行
 * 接收者：仓储主管
 * 推送时机：采购填写ERP退货单后
 */
export async function notifyPendingWarehouseExecute(
  order: ReturnOrder,
  erpReturnNo: string
): Promise<void> {
  try {
    console.log('[DingTalk] 准备发送待仓储执行通知:', order.returnNo);

    // 获取仓储主管
    const userIdList = await getDingtalkUserIdsByRole('warehouse_manager');
    if (userIdList.length === 0) {
      console.log('[DingTalk] 没有仓储主管，跳过推送');
      return;
    }

    // 获取仓储主管姓名（用于称呼）
    const userNames = await getUserNamesByRole('warehouse_manager');
    const greeting = userNames.length > 0 ? `${userNames.join('、')}：` : '您好：';

    const title = `【待退货】您有 1 条临期退货待执行，请尽快安排`;
    const content = `### 待仓储退货通知

${greeting}

以下临期退货商品已填写ERP采购退货单，请尽快安排商品退出，并录入退货情况：

| 退货单号 | 商品名称 | 数量 | ERP退货单号 | 剩余保质期 |
|----------|----------|------|------------|------------|
| ${order.returnNo} | ${order.goodsName} | ${order.quantity}${order.unit || ''} | ${erpReturnNo} | ${order.daysToExpire}天 |

请及时安排退货，并在系统中录入退货情况！

---
点击查看详情: ${ACTION_URL}

推送时间：${formatTimestamp()}`;

    const result = await sendWorkNotification(userIdList, title, content);
    console.log('[DingTalk] 待仓储执行通知发送结果:', result);
  } catch (error) {
    console.error('[DingTalk] 待仓储执行通知发送失败:', error);
  }
}

// ============================================================
// 兼容旧接口（保持向后兼容）
// ============================================================

/**
 * 通知：新退货单创建（待确认）
 * @deprecated 请使用 sendDailyNewReturnReminder 批量推送
 */
export async function notifyNewReturnOrder(order: ReturnOrder): Promise<void> {
  try {
    console.log('[DingTalk] 准备发送新退货单通知:', order.returnNo);

    // 获取采购主管
    const userIdList = await getDingtalkUserIdsByRole('procurement_manager');
    if (userIdList.length === 0) {
      console.log('[DingTalk] 没有可用的通知接收者');
      return;
    }

    const title = '新临期退货单待确认';
    const content = `## 新临期退货单待确认

${buildOrderInfoMarkdown(order)}

---
请及时登录系统确认退货规则。

推送时间：${formatTimestamp()}`;

    const result = await sendWorkNotification(userIdList, title, content);
    console.log('[DingTalk] 新退货单通知发送结果:', result);
  } catch (error) {
    console.error('[DingTalk] 新退货单通知发送失败:', error);
  }
}

/**
 * 通知：退货单已确认，待填写ERP退货单号
 * @deprecated 请使用 sendDailyPendingErpReminder 批量推送
 */
export async function notifyPendingErpFill(order: ReturnOrder): Promise<void> {
  try {
    console.log('[DingTalk] 准备发送待填写ERP通知:', order.returnNo);

    // 获取采购主管
    const userIdList = await getDingtalkUserIdsByRole('procurement_manager');
    if (userIdList.length === 0) {
      console.log('[DingTalk] 没有可用的通知接收者');
      return;
    }

    const title = '退货单待填写ERP退货单号';
    const content = `## 退货单待填写ERP退货单号

${buildOrderInfoMarkdown(order)}

---
请登录系统填写ERP退货单号。

推送时间：${formatTimestamp()}`;

    const result = await sendWorkNotification(userIdList, title, content);
    console.log('[DingTalk] 待填写ERP通知发送结果:', result);
  } catch (error) {
    console.error('[DingTalk] 待填写ERP通知发送失败:', error);
  }
}

/**
 * 通知：退货单已确认，待营销销售处理
 * @deprecated 请使用 notifyCannotPurchaseReturn
 */
export async function notifyPendingMarketingSale(order: ReturnOrder): Promise<void> {
  // 调用新函数
  await notifyCannotPurchaseReturn(order);
}
