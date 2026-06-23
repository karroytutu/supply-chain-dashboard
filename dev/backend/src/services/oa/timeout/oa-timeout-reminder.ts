/**
 * OA节点时限 - 催办通知发送
 * @module services/oa/timeout/oa-timeout-reminder
 */

import { createLogger } from '../../../utils/logger';
const log = createLogger('OaTimeout');

import { config } from '../../../config';
import { getDingtalkUserIds } from '../../notification/user-resolver';
import { sendWorkNotification } from '../../dingtalk.service';
import { getSupervisor } from '../../org/org-supervisor.query';
import type { OaMessageContent } from '../../dingtalk-types';
import type { OverdueNode } from './oa-timeout.types';

// =====================================================
// 催办通知
// =====================================================

/**
 * 发送催办通知给审批人
 * @returns true=发送成功，false=发送失败或跳过
 */
export async function sendReminder(node: OverdueNode): Promise<boolean> {
  if (!node.assigned_user_ids?.length) {
    log.warn(`节点 ${node.id} 无审批人，跳过催办`);
    return false;
  }

  const dingtalkUserIds = await getDingtalkUserIds(node.assigned_user_ids);
  if (dingtalkUserIds.length === 0) {
    log.warn(`节点 ${node.id} 用户无钉钉ID，跳过催办通知`);
    return false;
  }

  const overdueMs = Date.now() - new Date(node.deadline_at!).getTime();
  const overdueText = formatOverdueDuration(overdueMs);

  const oaMessage = buildReminderOaMessage(node, overdueText);

  try {
    await sendWorkNotification(
      dingtalkUserIds,
      oaMessage.head.text,
      '',
      {
        msgType: 'oa',
        oaMessage,
        businessType: 'oa',
        businessId: node.instance_id,
        businessNo: node.instance_no,
      }
    );
    log.info(`催办通知已发送: 节点${node.id}, 用户${node.assigned_user_ids?.join(',')}, 超时${overdueText}`);
    return true;
  } catch (error) {
    log.error(`催办通知发送失败: 节点${node.id}`, error);
    return false;
  }
}

/**
 * 发送抄送上级通知
 */
export async function sendSupervisorCc(node: OverdueNode): Promise<boolean> {
  if (!node.assigned_user_ids?.length) return false;

  const { supervisor } = await getSupervisor(node.assigned_user_ids[0]);
  if (!supervisor) {
    log.warn(`用户 ${node.assigned_user_ids[0]} 无直属上级，跳过抄送`);
    return false;
  }

  const dingtalkUserIds = await getDingtalkUserIds([supervisor.id]);
  if (dingtalkUserIds.length === 0) {
    log.warn(`上级 ${supervisor.id} 无钉钉ID，跳过抄送通知`);
    return false;
  }

  const overdueMs = Date.now() - new Date(node.deadline_at!).getTime();
  const overdueText = formatOverdueDuration(overdueMs);

  const oaMessage = buildCcSupervisorOaMessage(node, supervisor.name, overdueText);

  try {
    await sendWorkNotification(
      dingtalkUserIds,
      oaMessage.head.text,
      '',
      {
        msgType: 'oa',
        oaMessage,
        businessType: 'oa',
        businessId: node.instance_id,
        businessNo: node.instance_no,
      }
    );
    log.info(`抄送上级通知已发送: 节点${node.id}, 上级${supervisor.name}`);
    return true;
  } catch (error) {
    log.error(`抄送上级通知发送失败: 节点${node.id}`, error);
    return false;
  }
}

// =====================================================
// OA 消息构建
// =====================================================

/**
 * 构建催办 OA 消息
 */
function buildReminderOaMessage(node: OverdueNode, overdueText: string): OaMessageContent {
  const baseUrl = config.dingtalk.baseUrl;

  return {
    head: {
      text: `催办提醒 - ${node.form_type_name}`,
      bgColor: '#FF9800',
    },
    statusBar: {
      statusValue: '已超时',
      statusBg: '#FF5722',
    },
    body: {
      title: node.title,
      content: `您有一个「${node.node_name}」待处理已超时 ${overdueText}，请尽快处理`,
    },
    messageUrl: `${baseUrl}/oa/detail/${node.instance_id}`,
    pcMessageUrl: `${baseUrl}/oa/detail/${node.instance_id}`,
  };
}

/**
 * 构建抄送上级 OA 消息
 */
function buildCcSupervisorOaMessage(
  node: OverdueNode,
  supervisorName: string,
  overdueText: string
): OaMessageContent {
  const baseUrl = config.dingtalk.baseUrl;

  return {
    head: {
      text: `超时抄送 - ${node.form_type_name}`,
      bgColor: '#F44336',
    },
    statusBar: {
      statusValue: '超时抄送',
      statusBg: '#F44336',
    },
    body: {
      title: node.title,
      content: `${node.first_assigned_user_name || '审批人'} 的「${node.node_name}」已超时 ${overdueText}，已多次催办未处理，特此抄送给您`,
    },
    messageUrl: `${baseUrl}/oa/detail/${node.instance_id}`,
    pcMessageUrl: `${baseUrl}/oa/detail/${node.instance_id}`,
  };
}

// =====================================================
// 工具函数
// =====================================================

/**
 * 格式化超时时长
 */
function formatOverdueDuration(ms: number): string {
  if (ms <= 0) return '0分钟';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0 && days === 0) parts.push(`${minutes}分钟`);

  return parts.join('') || '不到1分钟';
}
