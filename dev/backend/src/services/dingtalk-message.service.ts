/**
 * 钉钉服务 - 消息发送
 * @module services/dingtalk-message.service
 */

import { config } from '../config';
import { getAccessToken, sendDingtalkRequest } from './dingtalk-client';
import { createNotificationLog, updateNotificationLogStatus } from './notification-log.service';
import type {
  MessageType,
  SendMessageOptions,
  SendResult,
} from './dingtalk-types';

/**
 * 发送钉钉工作通知
 * 支持 markdown、actionCard 和 oa 消息类型
 */
export async function sendWorkNotification(
  userIdList: string[],
  title: string,
  content: string,
  options?: SendMessageOptions
): Promise<SendResult> {
  try {
    if (!userIdList || userIdList.length === 0) {
      console.log('[Dingtalk] 工作通知跳过: 接收者列表为空');
      return { success: false, message: '接收者列表为空' };
    }

    const msgType: MessageType = options?.msgType || 'markdown';
    const accessToken = await getAccessToken();

    let msg: any;
    let contentForLog: string = content;

    switch (msgType) {
      case 'actionCard': {
        if (!options?.actionCard) {
          return { success: false, message: 'ActionCard 内容为空' };
        }
        const ac = options.actionCard;
        if (ac.btnJsonList && ac.btnJsonList.length > 0) {
          msg = {
            msgtype: 'action_card',
            action_card: {
              title: ac.title,
              markdown: ac.markdown,
              btn_orientation: ac.btnOrientation || '0',
              btn_json_list: ac.btnJsonList.map(btn => ({
                title: btn.title,
                action_url: btn.actionUrl,
              })),
            },
          };
        } else {
          msg = {
            msgtype: 'action_card',
            action_card: {
              title: ac.title,
              markdown: ac.markdown,
              single_title: ac.singleTitle || '查看详情',
              single_url: ac.singleUrl,
            },
          };
        }
        contentForLog = JSON.stringify(ac);
        break;
      }

      case 'oa': {
        if (!options?.oaMessage) {
          return { success: false, message: 'OA 消息内容为空' };
        }
        const oa = options.oaMessage;
        const oaBody: any = { title: oa.body.title };
        if (oa.body.form) oaBody.form = oa.body.form.map(row => ({ key: row.key, value: row.value }));
        if (oa.body.content) oaBody.content = oa.body.content;
        if (oa.body.rich) oaBody.rich = oa.body.rich;
        if (oa.body.image) oaBody.image = oa.body.image;
        if (oa.body.fileCount) oaBody.file_count = oa.body.fileCount;
        if (oa.body.author) oaBody.author = oa.body.author;

        const oaMsg: any = {
          head: {
            text: oa.head.text,
            ...(oa.head.bgColor ? { bgcolor: oa.head.bgColor } : {}),
          },
          body: oaBody,
        };
        if (oa.statusBar) {
          oaMsg.status_bar = {
            status_value: oa.statusBar.statusValue,
            status_bg: oa.statusBar.statusBg,
          };
        }
        if (oa.messageUrl) oaMsg.message_url = oa.messageUrl;
        if (oa.pcMessageUrl) oaMsg.pc_message_url = oa.pcMessageUrl;

        msg = { msgtype: 'oa', oa: oaMsg };
        contentForLog = JSON.stringify(oa);
        break;
      }

      case 'markdown':
      default:
        msg = {
          msgtype: 'markdown',
          markdown: { title, text: content },
        };
        contentForLog = content;
        break;
    }

    const requestBody = {
      agent_id: config.dingtalk.agentId,
      userid_list: userIdList.join(','),
      msg,
    };

    const response = await sendDingtalkRequest(accessToken, requestBody);

    if (response.errcode === 0) {
      const taskId = response.taskId;
      console.log('[Dingtalk] 工作通知发送成功:', { taskId, msgType, receivers: userIdList.length });

      const logId = await createNotificationLog({
        businessType: options?.businessType || 'collection',
        businessId: options?.businessId,
        businessNo: options?.businessNo,
        msgType, title, content: contentForLog,
        taskId, receiverIds: userIdList, createdBy: options?.createdBy,
      });

      await updateNotificationLogStatus(logId, 'sent', taskId);
      return { success: true, message: '发送成功', taskId, logId };
    } else {
      const errMsg = response.errmsg || '发送失败';
      console.error('[Dingtalk] 工作通知发送失败:', response);

      const logId = await createNotificationLog({
        businessType: options?.businessType || 'collection',
        businessId: options?.businessId,
        businessNo: options?.businessNo,
        msgType, title, content: contentForLog,
        receiverIds: userIdList, createdBy: options?.createdBy,
      });

      await updateNotificationLogStatus(logId, 'failed', undefined, errMsg);
      return { success: false, message: errMsg, logId };
    }
  } catch (error: any) {
    console.error('[Dingtalk] 工作通知发送异常:', error.message);
    return { success: false, message: error.message || '发送异常' };
  }
}
