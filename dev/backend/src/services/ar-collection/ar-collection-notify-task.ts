/**
 * 催收任务创建通知服务
 * 负责在催收任务创建后发送 ActionCard 格式的通知
 */

import { appQuery } from '../../db/appPool';
import { sendWorkNotification } from '../dingtalk';
import type { ActionCardContent } from '../dingtalk/dingtalk.types';
import type { CollectionTask } from './ar-collection.types';

/** 推送跳转地址 */
const ACTION_URL = 'https://xly.gzzxd.com/collection/overview';

/**
 * 格式化金额
 */
function formatAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return '¥0.00';
  return `¥${Number(amount).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * 构建任务创建通知的 ActionCard 消息
 */
export function buildTaskCreatedActionCard(task: CollectionTask): ActionCardContent {
  const consumerName = task.consumer_name || task.consumer_code;

  const markdown = `您有新的催收任务需要处理：

- **客户名称**: ${consumerName}
- **欠款总额**: ${formatAmount(task.total_amount)}
- **欠款笔数**: ${task.bill_count} 笔
- **最大逾期**: ${task.max_overdue_days} 天

请及时跟进催收！`;

  return {
    title: `【催收任务】${consumerName}`,
    markdown,
    singleTitle: '查看详情',
    singleUrl: ACTION_URL,
  };
}

/**
 * 批量发送任务创建通知
 * 按责任人分组，每人发送一条汇总消息
 * @param tasks 任务列表，包含 taskId 和 managerUserId
 */
export async function sendTaskCreatedNotifications(
  tasks: Array<[string, { taskId: number; managerUserId: number | null }]>
): Promise<void> {
  if (!tasks || tasks.length === 0) {
    console.log('[TaskCreatedNotify] 无任务需要发送通知');
    return;
  }

  // 按 managerUserId 分组
  const tasksByManager = new Map<number, number[]>();
  for (const [consumerCode, info] of tasks) {
    if (info.managerUserId) {
      const existing = tasksByManager.get(info.managerUserId) || [];
      existing.push(info.taskId);
      tasksByManager.set(info.managerUserId, existing);
    }
  }

  if (tasksByManager.size === 0) {
    console.log('[TaskCreatedNotify] 无有效责任人，跳过通知');
    return;
  }

  // 查询任务详情
  const taskIds = Array.from(tasksByManager.values()).flat();
  const uniqueTaskIds = [...new Set(taskIds)];

  const taskResult = await appQuery<CollectionTask>(
    `SELECT * FROM ar_collection_tasks WHERE id = ANY($1)`,
    [uniqueTaskIds]
  );

  if (taskResult.rows.length === 0) {
    console.log('[TaskCreatedNotify] 未找到任务详情');
    return;
  }

  // 建立任务ID到任务的映射
  const taskMap = new Map<number, CollectionTask>();
  for (const task of taskResult.rows) {
    taskMap.set(task.id, task);
  }

  // 查询用户钉钉ID
  const managerIds = Array.from(tasksByManager.keys());
  const userResult = await appQuery<{ id: number; dingtalk_user_id: string }>(
    `SELECT id, dingtalk_user_id FROM users
     WHERE id = ANY($1) AND status = 1 AND dingtalk_user_id IS NOT NULL`,
    [managerIds]
  );

  const userDingtalkMap = new Map<number, string>();
  for (const user of userResult.rows) {
    if (user.dingtalk_user_id && user.dingtalk_user_id !== 'dev_admin') {
      userDingtalkMap.set(user.id, user.dingtalk_user_id);
    }
  }

  // 发送通知
  let sentCount = 0;
  for (const [managerId, managerTaskIds] of tasksByManager) {
    const dingtalkId = userDingtalkMap.get(managerId);
    if (!dingtalkId) {
      console.log(`[TaskCreatedNotify] 用户 ${managerId} 无钉钉ID，跳过`);
      continue;
    }

    // 获取该责任人的第一个任务作为代表发送通知
    const taskId = managerTaskIds[0];
    const task = taskMap.get(taskId);
    if (!task) continue;

    try {
      const actionCard = buildTaskCreatedActionCard(task);
      // 如果有多条任务，在内容中添加提示
      if (managerTaskIds.length > 1) {
        actionCard.markdown += `\n\n> 本次共分配 ${managerTaskIds.length} 个催收任务`;
      }

      await sendWorkNotification([dingtalkId], actionCard.title, '', {
        msgType: 'actionCard',
        actionCard,
        businessType: 'collection',
        businessId: taskId,
        businessNo: task.task_no,
      });
      sentCount++;
    } catch (err) {
      console.error(`[TaskCreatedNotify] 发送通知失败: managerId=${managerId}`, err);
    }
  }

  console.log(`[TaskCreatedNotify] 发送完成: ${sentCount}/${tasksByManager.size}`);
}
