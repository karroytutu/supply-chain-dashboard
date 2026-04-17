/**
 * 钉钉工作通知重试处理服务
 * 处理发送失败的消息重试
 */

import { getAccessToken, createOapiClient } from './dingtalk.service';
import { getPendingRetryLogs, updateNotificationLogStatus } from './notification-log.service';
import { config } from '../../config';
import type { NotificationLog } from './dingtalk.types';
import {
  DEFAULT_RETRY_CONFIG,
  RETRYABLE_ERROR_CODES,
} from './dingtalk.types';

import {
  OapiMessageCorpconversationAsyncsend_v2Request,
  OapiMessageCorpconversationAsyncsend_v2Params,
  OapiMessageCorpconversationAsyncsend_v2ParamsMsg,
  OapiMessageCorpconversationAsyncsend_v2ParamsMsgMarkdown,
  OapiMessageCorpconversationAsyncsend_v2ParamsMsgActionCard,
  OapiMessageCorpconversationAsyncsend_v2ParamsMsgOa,
  OapiMessageCorpconversationAsyncsend_v2ParamsMsgOaHead,
  OapiMessageCorpconversationAsyncsend_v2ParamsMsgOaBody,
  OapiMessageCorpconversationAsyncsend_v2ParamsMsgOaBodyForm,
} from '../../../dingtalk-oapi/client';

/**
 * 计算下次重试时间
 * 使用指数退避算法
 */
export function calculateNextRetry(retryCount: number): Date {
  const delay = Math.min(
    DEFAULT_RETRY_CONFIG.baseDelayMs * Math.pow(DEFAULT_RETRY_CONFIG.backoffFactor, retryCount),
    DEFAULT_RETRY_CONFIG.maxDelayMs
  );
  
  const nextRetryAt = new Date(Date.now() + delay);
  return nextRetryAt;
}

/**
 * 判断错误是否可重试
 */
export function isRetryableError(errorCode: number): boolean {
  return RETRYABLE_ERROR_CODES.includes(errorCode);
}

/**
 * 重试发送单条消息
 */
async function retrySendMessage(log: NotificationLog): Promise<{ success: boolean; taskId?: number; error?: string }> {
  try {
    const accessToken = await getAccessToken();
    const client = createOapiClient(accessToken);

    // 构建消息
    const msg = new OapiMessageCorpconversationAsyncsend_v2ParamsMsg({});
    msg.msgtype = log.msgType;

    switch (log.msgType) {
      case 'markdown':
        msg.markdown = new OapiMessageCorpconversationAsyncsend_v2ParamsMsgMarkdown({});
        msg.markdown.title = log.title;
        msg.markdown.text = log.content || '';
        break;

      case 'actionCard':
        const actionCardData = log.content ? JSON.parse(log.content) : {};
        msg.actionCard = new OapiMessageCorpconversationAsyncsend_v2ParamsMsgActionCard({});
        msg.actionCard.title = actionCardData.title || log.title;
        msg.actionCard.markdown = actionCardData.markdown || '';
        if (actionCardData.singleUrl) {
          msg.actionCard.singleUrl = actionCardData.singleUrl;
          msg.actionCard.singleTitle = actionCardData.singleTitle || '查看详情';
        }
        break;

      case 'oa':
        const oaData = log.content ? JSON.parse(log.content) : {};
        msg.oa = new OapiMessageCorpconversationAsyncsend_v2ParamsMsgOa({});
        msg.oa.messageUrl = oaData.messageUrl || '';
        if (oaData.head) {
          msg.oa.head = new OapiMessageCorpconversationAsyncsend_v2ParamsMsgOaHead({});
          msg.oa.head.text = oaData.head.text;
          msg.oa.head.bgcolor = oaData.head.bgcolor;
        }
        if (oaData.body) {
          msg.oa.body = new OapiMessageCorpconversationAsyncsend_v2ParamsMsgOaBody({});
          msg.oa.body.title = oaData.body.title;
          msg.oa.body.content = oaData.body.content;
          if (oaData.body.form && Array.isArray(oaData.body.form)) {
            msg.oa.body.form = oaData.body.form.map((item: any) => {
              const formItem = new OapiMessageCorpconversationAsyncsend_v2ParamsMsgOaBodyForm({});
              formItem.key = item.key;
              formItem.value = item.value;
              return formItem;
            });
          }
        }
        break;

      default:
        throw new Error(`不支持的消息类型: ${log.msgType}`);
    }

    // 构建请求
    const request = new OapiMessageCorpconversationAsyncsend_v2Request({});
    request.params = new OapiMessageCorpconversationAsyncsend_v2Params({});
    request.params.agentId = Number(config.dingtalk.agentId);
    request.params.useridList = log.receiverIds;
    request.params.msg = msg;

    const response = await client.oapiMessageCorpconversationAsyncsend_v2(request);

    if (response.body && response.body.errcode === 0) {
      return { success: true, taskId: response.body.taskId };
    } else {
      const errorCode = response.body?.errcode || 0;
      const errorMsg = response.body?.errmsg || '发送失败';
      
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

/**
 * 初始化失败记录的重试时间
 * 为没有 next_retry_at 的失败记录设置下次重试时间
 */
export async function initializeRetryTimes(): Promise<number> {
  const result = await getPendingRetryLogs();
  let initialized = 0;

  for (const log of result) {
    if (!log.nextRetryAt && log.retryCount < log.maxRetry) {
      const nextRetryAt = calculateNextRetry(log.retryCount);
      await updateNotificationLogStatus(
        log.id,
        undefined,
        undefined,
        undefined,
        log.retryCount,
        nextRetryAt
      );
      initialized++;
    }
  }

  if (initialized > 0) {
    console.log(`[DingtalkRetry] 为 ${initialized} 条失败记录初始化了重试时间`);
  }

  return initialized;
}
