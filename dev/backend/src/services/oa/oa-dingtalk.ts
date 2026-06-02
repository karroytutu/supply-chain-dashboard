/**
 * OA钉钉通知构建器
 * 负责构建ActionCard和OA消息内容，发送通知
 * @module services/oa/oa-dingtalk
 */

import { config } from '../../config';
import {
  ActionCardContent,
  ActionCardButton,
  OaMessageContent,
  sendWorkNotification,
} from '../dingtalk.service';
import { FormSchema } from './oa.types';
import { OA_DINGTALK_STATUS } from '../../utils/constants';
import { extractFormSummary, buildFormSummaryMarkdown } from './oa-form-summary';

// =====================================================
// 类型定义
// =====================================================

/** 通知参数 */
export interface DingtalkNotifyParams {
  instanceId: number;
  instanceNo: string;
  title: string;
  formTypeName: string;
  applicantName: string;
  nodeName?: string;
  nodeOrder?: number;
  reason?: string;
  fromUserName?: string;
  formSchema?: FormSchema;
  formData?: Record<string, unknown>;
  rejectUserName?: string;
}

// =====================================================
// ActionCard 消息构建
// =====================================================

/**
 * 构建待处理ActionCard消息
 * 仅包含"查看详情"按钮
 */
export async function buildPendingActionCard(
  params: DingtalkNotifyParams,
  _userId: number
): Promise<ActionCardContent> {
  const baseUrl = config.app.baseUrl;
  const { instanceId, title, formTypeName, applicantName, nodeName, formSchema, formData } = params;

  // 构建Markdown摘要
  const extraRows: Array<{ key: string; value: string }> = [
    { key: '申请人', value: applicantName },
  ];
  if (nodeName) {
    extraRows.push({ key: '当前节点', value: nodeName });
  }

  const markdown = `## 待处理 - ${formTypeName}

${buildFormSummaryMarkdown(formSchema, formData, extraRows)}

请尽快处理审批。`;

  const btnJsonList: ActionCardButton[] = [
    {
      title: '查看详情',
      actionUrl: `${baseUrl}/oa/detail/${instanceId}`,
    },
  ];

  return {
    title: `待处理 - ${formTypeName}`,
    markdown,
    btnJsonList,
    btnOrientation: '1',
  };
}

// =====================================================
// OA 消息构建
// =====================================================

/**
 * 构建审批结果OA消息
 */
export function buildResultOaMessage(
  params: DingtalkNotifyParams,
  status: 'approved' | 'rejected' | 'withdrawn'
): OaMessageContent {
  const baseUrl = config.app.baseUrl;
  const { instanceId, title, formTypeName, applicantName, formSchema, formData, rejectUserName, reason } = params;

  const statusConfig = OA_DINGTALK_STATUS[status === 'approved' ? 'APPROVED' : status === 'rejected' ? 'REJECTED' : 'WITHDRAWN'];
  const statusLabel = statusConfig.value;

  // 构建表单摘要
  const formRows = extractFormSummary(formSchema, formData);
  if (status === 'rejected' && rejectUserName) {
    formRows.push({ key: '审批人', value: rejectUserName });
    if (reason) formRows.push({ key: '拒绝原因', value: reason });
  }

  return {
    head: {
      text: `${statusLabel} - ${formTypeName}`,
      bgColor: statusConfig.bg,
    },
    statusBar: {
      statusValue: statusLabel,
      statusBg: statusConfig.bg,
    },
    body: {
      title: title,
      form: formRows.length > 0 ? formRows : undefined,
      content: status === 'approved'
        ? `${applicantName} 提交的 ${formTypeName} 已审批通过`
        : status === 'rejected'
          ? `${applicantName} 提交的 ${formTypeName} 已被拒绝`
          : `${applicantName} 提交的 ${formTypeName} 已撤回`,
    },
    messageUrl: `${baseUrl}/oa/detail/${instanceId}`,
    pcMessageUrl: `${baseUrl}/oa/detail/${instanceId}`,
  };
}

/**
 * 构建抄送OA消息
 */
export function buildCcOaMessage(params: DingtalkNotifyParams): OaMessageContent {
  const baseUrl = config.app.baseUrl;
  const { instanceId, title, formTypeName, applicantName, formSchema, formData } = params;

  const formRows = extractFormSummary(formSchema, formData);

  return {
    head: {
      text: `抄送 - ${formTypeName}`,
      bgColor: OA_DINGTALK_STATUS.CC.bg,
    },
    statusBar: {
      statusValue: OA_DINGTALK_STATUS.CC.value,
      statusBg: OA_DINGTALK_STATUS.CC.bg,
    },
    body: {
      title: title,
      form: formRows.length > 0 ? formRows : undefined,
      content: `${applicantName} 提交的 ${formTypeName} 已抄送给您`,
    },
    messageUrl: `${baseUrl}/oa/detail/${instanceId}`,
    pcMessageUrl: `${baseUrl}/oa/detail/${instanceId}`,
  };
}

/**
 * 构建转交/加签的待处理ActionCard消息
 * 仅包含"查看详情"按钮
 */
export async function buildTransferActionCard(
  params: DingtalkNotifyParams,
  _userId: number
): Promise<ActionCardContent> {
  const baseUrl = config.app.baseUrl;
  const { instanceId, title, formTypeName, applicantName, fromUserName, nodeName, formSchema, formData } = params;

  const extraRows: Array<{ key: string; value: string }> = [
    { key: '申请人', value: applicantName },
  ];
  if (fromUserName) {
    extraRows.push({ key: '转交人', value: fromUserName });
  }
  if (nodeName) {
    extraRows.push({ key: '当前节点', value: nodeName });
  }

  const markdown = `## 转交待处理 - ${formTypeName}

${buildFormSummaryMarkdown(formSchema, formData, extraRows)}

此审批已转交给您处理。`;

  const btnJsonList: ActionCardButton[] = [
    {
      title: '查看详情',
      actionUrl: `${baseUrl}/oa/detail/${instanceId}`,
    },
  ];

  return {
    title: `转交待处理 - ${formTypeName}`,
    markdown,
    btnJsonList,
    btnOrientation: '1',
  };
}

// =====================================================
// 通知发送
// =====================================================

/**
 * 发送待处理ActionCard通知
 * @returns taskId（用于后续状态栏更新）
 */
export async function sendPendingNotification(
  dingtalkUserIds: string[],
  actionCard: ActionCardContent,
  instanceId: number,
  businessNo?: string
): Promise<number | undefined> {
  const result = await sendWorkNotification(dingtalkUserIds, actionCard.title, actionCard.markdown, {
    msgType: 'actionCard',
    actionCard,
    businessType: 'oa',
    businessId: instanceId,
    businessNo,
  });
  return result.taskId;
}

/**
 * 发送审批结果OA通知
 * @returns taskId
 */
export async function sendResultNotification(
  dingtalkUserIds: string[],
  oaMessage: OaMessageContent,
  instanceId: number,
  businessNo?: string
): Promise<number | undefined> {
  const result = await sendWorkNotification(dingtalkUserIds, oaMessage.head.text, '', {
    msgType: 'oa',
    oaMessage,
    businessType: 'oa',
    businessId: instanceId,
    businessNo,
  });
  return result.taskId;
}

/**
 * 发送抄送OA通知
 * @returns taskId
 */
export async function sendCcNotification(
  dingtalkUserIds: string[],
  oaMessage: OaMessageContent,
  instanceId: number,
  businessNo?: string
): Promise<number | undefined> {
  const result = await sendWorkNotification(dingtalkUserIds, oaMessage.head.text, '', {
    msgType: 'oa',
    oaMessage,
    businessType: 'oa',
    businessId: instanceId,
    businessNo,
  });
  return result.taskId;
}
