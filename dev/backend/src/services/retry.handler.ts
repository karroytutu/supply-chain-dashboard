/**
 * 钉钉工作通知重试处理服务
 * 处理发送失败的消息重试
 */

import { getAccessToken, sendDingtalkRequest } from './dingtalk.service';
import { getPendingRetryLogs, updateNotificationLogStatus } from './notification-log.service';
import { config } from '../config';
import type { NotificationLog } from './dingtalk.service';
import {
  DEFAULT_RETRY_CONFIG,
  RETRYABLE_ERROR_CODES,
} from './dingtalk.service';

/**
 * 计算下次重试时间
 * 使用指数退避算法
 */
export function calculateNextRetry(retryCount: number): Date {
  const delay = Math.min(
    DEFAULT_RETRY_CONFIG.baseDelayMs * Math.pow(DEFAULT_RETRY_CONFIG.backoffFactor, retryCount),
    DEFAULT_RETRY_CONFIG.maxDelayMs
  );

  return new Date(Date.now() + delay);
}

/**
 * 判断错误是否可重试
 */
export function isRetryableError(errorCode: number): boolean {
  return RETRYABLE_ERROR_CODES.includes(errorCode);
}

/**
 * 重试发送单条消息
 * 使用 HTTP JSON 方式发送，与 sendWorkNotification 保持一致
 */
async function retrySendMessage(log: NotificationLog): Promise<{ success: boolean; taskId?: number; error?: string }> {
  try {
    const accessToken = await getAccessToken();

    // 构建消息体
    let msg: any;

    switch (log.msgType) {
      case 'markdown':
        msg = {
          msgtype: 'markdown',
          markdown: {
            title: log.title,
            text: log.content || '',
          },
        };
        break;

      case 'actionCard': {
        const actionCardData = log.content ? JSON.parse(log.content) : {};
        msg = {
          msgtype: 'action_card',
          action_card: {
            title: actionCardData.title || log.title,
            markdown: actionCardData.markdown || '',
            single_title: actionCardData.singleTitle || '查看详情',
            single_url: actionCardData.singleUrl || '',
          },
        };
        break;
      }

      default:
        throw new Error(`不支持的消息类型: ${log.msgType}`);
    }

    // 构建请求体
    const requestBody = {
      agent_id: config.dingtalk.agentId,
      userid_list: log.receiverIds.join(','),
      msg,
    };

    const response = await sendDingtalkRequest(accessToken, requestBody);

    if (response.errcode === 0) {
      return { success: true, taskId: response.taskId };
    } else {
      const errorCode = response.errcode || 0;
      const errorMsg = response.errmsg || '发送失败';

      // 如果是不可重试的错误，标记为最终失败
      if (!isRetryableError(errorCode)) {
        return { success: false, error: `不可重试错误(${errorCode}): ${errorMsg}` };
      }

      return { success: false, error: errorMsg };
    }
  } catch (error: any) {
    console.error('[DingtalkRetry] 重试发送异常:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 处理重试队列
 * 由定时任务调用
 */
export async function handleRetry(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  pending: number;
}> {
  const result = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    pending: 0,
  };

  try {
    // 获取待重试的记录
    const pendingLogs = await getPendingRetryLogs();
    console.log(`[DingtalkRetry] 获取到 ${pendingLogs.length} 条待重试记录`);

    for (const log of pendingLogs) {
      result.processed++;

      // 检查是否超过最大重试次数
      if (log.retryCount >= log.maxRetry) {
        await updateNotificationLogStatus(log.id, 'failed', undefined, '超过最大重试次数');
        result.failed++;
        console.log(`[DingtalkRetry] 记录 ${log.id} 超过最大重试次数，标记为失败`);
        continue;
      }

      // 尝试重试发送
      const retryResult = await retrySendMessage(log);

      if (retryResult.success) {
        // 重试成功
        await updateNotificationLogStatus(log.id, 'sent', retryResult.taskId);
        result.succeeded++;
        console.log(`[DingtalkRetry] 记录 ${log.id} 重试成功，taskId: ${retryResult.taskId}`);
      } else {
        // 重试失败
        const newRetryCount = log.retryCount + 1;

        if (newRetryCount >= log.maxRetry) {
          // 达到最大重试次数，标记为失败
          await updateNotificationLogStatus(
            log.id,
            'failed',
            undefined,
            `重试${newRetryCount}次后失败: ${retryResult.error}`
          );
          result.failed++;
          console.log(`[DingtalkRetry] 记录 ${log.id} 重试 ${newRetryCount} 次后仍失败，标记为最终失败`);
        } else {
          // 更新重试次数和下次重试时间
          const nextRetryAt = calculateNextRetry(newRetryCount);
          await updateNotificationLogStatus(
            log.id,
            'failed',
            undefined,
            retryResult.error,
            newRetryCount,
            nextRetryAt
          );
          result.pending++;
          console.log(`[DingtalkRetry] 记录 ${log.id} 第 ${newRetryCount} 次重试失败，下次重试时间: ${nextRetryAt.toISOString()}`);
        }
      }
    }

    console.log('[DingtalkRetry] 重试处理完成:', result);
    return result;
  } catch (error: any) {
    console.error('[DingtalkRetry] 重试处理异常:', error.message);
    return result;
  }
}
