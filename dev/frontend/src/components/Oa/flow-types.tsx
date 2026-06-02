/**
 * 审批流程组件共享类型、常量和工具函数
 */
import React from 'react';
import {
  UserOutlined,
  TeamOutlined,
  FormOutlined,
  SettingOutlined,
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
  dynamic_supervisor: { icon: <UserOutlined />, color: '#1890ff' },
  role: { icon: <TeamOutlined />, color: '#722ed1' },
  specific_user: { icon: <UserOutlined />, color: '#52c41a' },
  countersign: { icon: <TeamOutlined />, color: '#fa8c16' },
  data_input: { icon: <FormOutlined />, color: '#13c2c2' },
  auto: { icon: <SettingOutlined />, color: '#722ed1' },
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
  failed: '执行失败',
  skipped: '已跳过',
  cancelled: '已取消',
};

// =====================================================
// 操作类型标签映射（actual 模式使用）
// =====================================================

export const ACTION_TYPE_CONFIG: Record<string, { label: string; cls: string }> = {
  submit: { label: '提交', cls: styles.actionTagSubmit },
  approve: { label: '通过', cls: styles.actionTagApprove },
  reject: { label: '驳回', cls: styles.actionTagReject },
  transfer: { label: '转交', cls: styles.actionTagTransfer },
  countersign: { label: '加签', cls: styles.actionTagCountersign },
  withdraw: { label: '撤回', cls: styles.actionTagWithdraw },
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
}

/** 统一 Props（联合类型） */
export type ApprovalFlowProps = ApprovalFlowPreviewProps | ApprovalFlowActualProps;
