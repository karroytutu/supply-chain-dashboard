/**
 * 退货考核钉钉通知服务
 */

import { appQuery } from '../../db/appPool';
import { sendWorkNotification } from '../dingtalk.service';
import {
  PENALTY_TYPE_NAMES,
  PENALTY_ROLE_NAMES,
  type PenaltyType,
  type PenaltyRecord,
} from './return-penalty.types';

/**
 * 发送考核通知给用户
 */
export async function sendPenaltyNotification(
  userId: number,
  userName: string,
  penalties: PenaltyRecord[]
): Promise<void> {
  if (penalties.length === 0) return;

  try {
    // 生成表格行
    const penaltyRows = penalties.map(p => {
      const typeName = PENALTY_TYPE_NAMES[p.penaltyType] || p.penaltyType;
      return `| ${typeName} | ${p.returnNo || '-'} | ${p.goodsName || '-'} | ${p.overdueDays || '-'} | ¥${p.penaltyAmount.toFixed(2)} |`;
    }).join('\n');

    const message = `### 退货考核通知

${userName}：

您有以下退货考核记录：

| 考核类型 | 退货单号 | 商品名称 | 超时天数 | 考核金额 |
|----------|----------|----------|----------|----------|
${penaltyRows}

请及时处理相关退货任务，避免更多考核。

---
推送时间：${new Date().toLocaleString('zh-CN')}`;

    // 查询用户的钉钉用户ID
    const userResult = await appQuery<{ dingtalk_user_id: string }>(
      'SELECT dingtalk_user_id FROM users WHERE id = $1',
      [userId]
    );

    const dingtalkUserId = userResult.rows[0]?.dingtalk_user_id;
    if (!dingtalkUserId) {
      console.warn(`[ReturnPenalty] 用户 ${userName} 未绑定钉钉，跳过通知`);
      return;
    }

    // 发送钉钉消息
    await sendWorkNotification(
      [dingtalkUserId],
      '退货考核通知',
      message
    );

    console.log(`[ReturnPenalty] 考核通知已发送给 ${userName}，共 ${penalties.length} 条`);
  } catch (error) {
    console.error(`[ReturnPenalty] 发送考核通知失败: ${userName}`, error);
  }
}

/**
 * 批量发送考核通知
 * 按用户分组发送
 */
export async function sendBatchPenaltyNotifications(
  penalties: PenaltyRecord[]
): Promise<void> {
  if (penalties.length === 0) return;

  // 按用户分组
  const userPenaltiesMap = new Map<number, PenaltyRecord[]>();
  for (const penalty of penalties) {
    const existing = userPenaltiesMap.get(penalty.penaltyUserId) || [];
    existing.push(penalty);
    userPenaltiesMap.set(penalty.penaltyUserId, existing);
  }

  // 依次发送通知
  for (const [userId, userPenalties] of userPenaltiesMap) {
    const userName = userPenalties[0].penaltyUserName;
    await sendPenaltyNotification(userId, userName, userPenalties);
  }
}

/**
 * 发送考核生成通知
 * 在定时任务创建考核后调用
 */
export async function notifyPenaltyCreated(
  createdCount: number
): Promise<void> {
  if (createdCount === 0) return;

  try {
    // 查询今天创建的待确认考核记录
    const result = await appQuery<PenaltyRecord & { dingtalk_user_id: string }>(
      `SELECT
        p.id,
        p.return_order_id as "returnOrderId",
        p.penalty_type as "penaltyType",
        p.penalty_user_id as "penaltyUserId",
        p.penalty_user_name as "penaltyUserName",
        p.penalty_role as "penaltyRole",
        p.penalty_amount as "penaltyAmount",
        p.overdue_days as "overdueDays",
        p.status,
        r.return_no as "returnNo",
        r.goods_name as "goodsName",
        u.dingtalk_user_id as "dingtalk_user_id"
      FROM return_penalty_records p
      LEFT JOIN expiring_return_orders r ON p.return_order_id = r.id
      LEFT JOIN users u ON p.penalty_user_id = u.id
      WHERE p.created_at::date = CURRENT_DATE
        AND p.status = 'pending'
      ORDER BY p.penalty_user_id`
    );

    const penalties = result.rows;
    if (penalties.length === 0) return;

    await sendBatchPenaltyNotifications(penalties);
  } catch (error) {
    console.error('[ReturnPenalty] 发送考核通知失败:', error);
  }
}
