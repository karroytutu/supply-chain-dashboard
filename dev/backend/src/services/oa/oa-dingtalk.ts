/**
 * OA钉钉通知构建器
 * 负责构建审批结果和抄送的OA消息内容，发送通知
 * 待处理场景已迁移到钉钉流程中心待办，不再使用ActionCard
 * @module services/oa/oa-dingtalk
 */

import { config } from '../../config';
import { OaMessageContent, sendWorkNotification } from '../dingtalk.service';
import { FormSchema } from './oa.types';
import { OA_DINGTALK_STATUS } from '../../utils/constants';
import { extractFormSummary } from './oa-form-summary';

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
// OA 消息构建
// =====================================================

/**
 * 构建审批结果OA消息
 */
export function buildResultOaMessage(
  params: DingtalkNotifyParams,
  status: 'approved' | 'rejected' | 'withdrawn'
): OaMessageContent {
  const baseUrl = config.dingtalk.baseUrl;
  const {
    instanceId,
    title,
    formTypeName,
    applicantName,
    formSchema,
    formData,
    rejectUserName,
    reason,
  } = params;

  const statusConfig =
    OA_DINGTALK_STATUS[
      status === 'approved' ? 'APPROVED' : status === 'rejected' ? 'REJECTED' : 'WITHDRAWN'
    ];
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
      content:
        status === 'approved'
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
  const baseUrl = config.dingtalk.baseUrl;
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

// =====================================================
// 通知发送
// =====================================================

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
