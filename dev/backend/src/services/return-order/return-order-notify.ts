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
 * 通知：新退货单创建（待确认）
 * 接收者：运营人员（有 return-confirm 权限的角色）
 */
export async function notifyNewReturnOrder(order: ReturnOrder): Promise<void> {
  try {
    console.log('[DingTalk] 准备发送新退货单通知:', order.returnNo);

    // 获取有确认权限的用户（假设是 admin 和 operator 角色）
    const adminUsers = await getDingtalkUserIdsByRole('admin');
    const operatorUsers = await getDingtalkUserIdsByRole('operator');
    const userIdList = [...new Set([...adminUsers, ...operatorUsers])];

    if (userIdList.length === 0) {
      console.log('[DingTalk] 没有可用的通知接收者');
      return;
    }

    const title = '新临期退货单待确认';
    const content = `## 新临期退货单待确认

${buildOrderInfoMarkdown(order)}

---
请及时登录系统确认退货规则。`;

    const result = await sendWorkNotification(userIdList, title, content);
    console.log('[DingTalk] 新退货单通知发送结果:', result);
  } catch (error) {
    console.error('[DingTalk] 新退货单通知发送失败:', error);
  }
}

/**
 * 通知：退货单已确认，待填写ERP退货单号
 * 接收者：运营人员
 */
export async function notifyPendingErpFill(order: ReturnOrder): Promise<void> {
  try {
    console.log('[DingTalk] 准备发送待填写ERP通知:', order.returnNo);

    const adminUsers = await getDingtalkUserIdsByRole('admin');
    const operatorUsers = await getDingtalkUserIdsByRole('operator');
    const userIdList = [...new Set([...adminUsers, ...operatorUsers])];

    if (userIdList.length === 0) {
      console.log('[DingTalk] 没有可用的通知接收者');
      return;
    }

    const title = '退货单待填写ERP退货单号';
    const content = `## 退货单待填写ERP退货单号

${buildOrderInfoMarkdown(order)}

---
请登录系统填写ERP退货单号。`;

    const result = await sendWorkNotification(userIdList, title, content);
    console.log('[DingTalk] 待填写ERP通知发送结果:', result);
  } catch (error) {
    console.error('[DingTalk] 待填写ERP通知发送失败:', error);
  }
}

/**
 * 通知：退货单已确认，待营销销售处理
 * 接收者：责任营销师
 */
export async function notifyPendingMarketingSale(order: ReturnOrder): Promise<void> {
  try {
    console.log('[DingTalk] 准备发送待营销处理通知:', order.returnNo);

    // 这里需要根据营销师名称查找对应的用户
    // 暂时通知所有营销角色用户
    const marketingUsers = await getDingtalkUserIdsByRole('marketing');
    const adminUsers = await getDingtalkUserIdsByRole('admin');
    const userIdList = [...new Set([...marketingUsers, ...adminUsers])];

    if (userIdList.length === 0) {
      console.log('[DingTalk] 没有可用的通知接收者');
      return;
    }

    const title = '退货单待营销销售处理';
    const content = `## 退货单待营销销售处理

${buildOrderInfoMarkdown(order)}

---
该退货单需要营销销售处理，请登录系统查看详情。`;

    const result = await sendWorkNotification(userIdList, title, content);
    console.log('[DingTalk] 待营销处理通知发送结果:', result);
  } catch (error) {
    console.error('[DingTalk] 待营销处理通知发送失败:', error);
  }
}

/**
 * 通知：ERP退货单号已填写，待仓储执行
 * 接收者：仓储人员
 */
export async function notifyPendingWarehouseExecute(
  order: ReturnOrder,
  erpReturnNo: string
): Promise<void> {
  try {
    console.log('[DingTalk] 准备发送待仓储执行通知:', order.returnNo);

    const warehouseUsers = await getDingtalkUserIdsByRole('warehouse');
    const adminUsers = await getDingtalkUserIdsByRole('admin');
    const userIdList = [...new Set([...warehouseUsers, ...adminUsers])];

    if (userIdList.length === 0) {
      console.log('[DingTalk] 没有可用的通知接收者');
      return;
    }

    const title = '退货单待仓储执行';
    const content = `## 退货单待仓储执行

${buildOrderInfoMarkdown(order)}

**ERP退货单号：** ${erpReturnNo}

---
ERP退货单号已填写，请登录系统执行仓储退货操作。`;

    const result = await sendWorkNotification(userIdList, title, content);
    console.log('[DingTalk] 待仓储执行通知发送结果:', result);
  } catch (error) {
    console.error('[DingTalk] 待仓储执行通知发送失败:', error);
  }
}

/**
 * 通知：退货单已完成
 * 接收者：相关操作人员
 */
export async function notifyReturnOrderCompleted(order: ReturnOrder): Promise<void> {
  try {
    console.log('[DingTalk] 准备发送退货单完成通知:', order.returnNo);

    // 获取相关用户
    const adminUsers = await getDingtalkUserIdsByRole('admin');
    const operatorUsers = await getDingtalkUserIdsByRole('operator');
    const userIdList = [...new Set([...adminUsers, ...operatorUsers])];

    if (userIdList.length === 0) {
      console.log('[DingTalk] 没有可用的通知接收者');
      return;
    }

    const title = '退货单已完成';
    const content = `## 退货单已完成

${buildOrderInfoMarkdown(order)}

---
该临期退货单已全部处理完成。`;

    const result = await sendWorkNotification(userIdList, title, content);
    console.log('[DingTalk] 完成通知发送结果:', result);
  } catch (error) {
    console.error('[DingTalk] 完成通知发送失败:', error);
  }
}
