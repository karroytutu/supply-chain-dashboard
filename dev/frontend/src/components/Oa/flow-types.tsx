/**
 * 审批流程组件共享类型、常量和工具函数
 */
import React from 'react';
import {
  UserOutlined,
  TeamOutlined,
  SettingOutlined,
  SendOutlined,
} from '@ant-design/icons';
import type { WorkflowNodeDef, ApprovalNode, ApprovalAction, ApprovalStatus, CcUser, ErpMeta } from '@/types/oa';
import styles from './ApprovalFlow.less';

// =====================================================
// 模式类型
// =====================================================

export type ApprovalFlowMode = 'preview' | 'actual';

// =====================================================
// 节点类型视觉配置（preview 模式使用）
// =====================================================

export const NODE_TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  approval: { icon: <TeamOutlined />, color: '#722ed1' },
  handle: { icon: <UserOutlined />, color: '#1890ff' },
  auto: { icon: <SettingOutlined />, color: '#722ed1' },
  cc: { icon: <SendOutlined />, color: '#1890ff' },
};

// =====================================================
// 节点状态标签（actual 模式使用）
// =====================================================

export const NODE_STATUS_TEXT: Record<string, string> = {
  pending: '待处理',
  processing: '处理中',
  approved: '已通过',
  rejected: '已拒绝',
  transferred: '已转交',
  sent_back: '已退回',
  failed: '执行失败',
  cancelled: '已取消',
};

// =====================================================
// 操作类型标签映射（actual 模式使用）
// =====================================================

export const ACTION_TYPE_CONFIG: Record<string, { label: string; cls: string }> = {
  submit: { label: '提交', cls: styles.actionTagSubmit },
  approve: { label: '通过', cls: styles.actionTagApprove },
  reject: { label: '拒绝', cls: styles.actionTagReject },
  transfer: { label: '转交', cls: styles.actionTagTransfer },
  send_back: { label: '退回', cls: styles.actionTagTransfer },
  countersign: { label: '加签', cls: styles.actionTagCountersign },
  withdraw: { label: '撤回', cls: styles.actionTagWithdraw },
  handover: { label: '交接', cls: styles.actionTagHandover },
};

// =====================================================
// ERP 状态标签映射（actual 模式使用）
// =====================================================

export const ERP_STATUS_CONFIG: Record<string, { color: string; text: string }> = {
  pending: { color: 'default', text: '待处理' },
  processing: { color: 'processing', text: '处理中' },
  paying: { color: 'processing', text: '支付中' },
  purchasing: { color: 'processing', text: '采购中' },
  storing: { color: 'processing', text: '入库中' },
  completed: { color: 'success', text: '已完成' },
  erp_completed: { color: 'success', text: '已完成' },
  erp_failed: { color: 'error', text: '失败' },
};

// =====================================================
// Props 接口
// =====================================================

/** preview 模式 props */
export interface ApprovalFlowPreviewProps {
  mode: 'preview';
  /** 流程定义节点列表 */
  workflowNodes: WorkflowNodeDef[];
  /** 表单类型编码，用于预解析审批人 */
  formTypeCode?: string;
  /** 字段 key → 标签映射，用于条件文本人性化 */
  fieldLabels?: Record<string, string>;
  /** 当前表单数据，用于条件节点过滤 */
  formData?: Record<string, unknown>;
}

/** actual 模式 props（mode 可选，默认 'actual'，保持向后兼容） */
export interface ApprovalFlowActualProps {
  mode?: 'actual';
  nodes: ApprovalNode[];
  ccUsers?: CcUser[];
  currentStep: number;
  instanceStatus: ApprovalStatus;
  actions?: ApprovalAction[];
  erpMeta?: ErpMeta | null;
  instanceId?: number;
  /** 申请人姓名（用于渲染发起申请节点） */
  applicantName?: string;
  /** 申请人头像URL（用于渲染发起申请节点） */
  applicantAvatar?: string | null;
  /** 提交时间（用于渲染发起申请节点） */
  submittedAt?: string;
  /** auto 节点重试成功后的回调（触发数据刷新/轮询） */
  onRetrySuccess?: () => void;
}

/** 统一 Props（联合类型） */
export type ApprovalFlowProps = ApprovalFlowPreviewProps | ApprovalFlowActualProps;

// =====================================================
// Ant Design Timeline 辅助工具
// =====================================================

/** 根据节点状态返回 Ant Design Timeline.Item 的 color 值 */
export function getTimelineColor(status: string): string {
  const map: Record<string, string> = {
    approved: 'green',
    rejected: 'red',
    failed: 'red',
    pending: 'gray',
    processing: 'blue',
    transferred: '#fa8c16',
    sent_back: '#fa8c16',
    cancelled: 'gray',
  };
  return map[status] || 'blue';
}

/** 节点标题行组件（标题 + 副标题 + 状态 + 时间） */
export function NodeHeader({ title, subtitle, status, statusColor, time }: {
  title: string;
  subtitle?: string;
  status?: string;
  statusColor?: string;
  time?: string | null;
}) {
  if (!title && !subtitle && !status && !time) return null;
  return (
    <div className={styles.timelineHeader}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
        {title && <span className={styles.timelineTitle}>{title}</span>}
        {subtitle && <span className={styles.timelineSubtitle}>{subtitle}</span>}
        {status && <span className={styles.timelineStatus} style={{ color: statusColor }}>{status}</span>}
      </div>
      {time && <span className={styles.timelineTime}>{time}</span>}
    </div>
  );
}
