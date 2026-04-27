import React from 'react';
import { Spin, Empty, Tag, Button, Popconfirm, Tooltip } from 'antd';
import {
  SwapOutlined,
  TeamOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import type { ApprovalDetail, ViewMode } from '@/types/oa-approval';
import { STATUS_LABELS, STATUS_COLORS, URGENCY_LABELS, URGENCY_COLORS } from '@/types/oa-approval';
import ApprovalFlow from '@/components/OaApproval/ApprovalFlow';
import { FormFieldRenderer as FieldRenderer } from '@/components/OaApproval';
import { useErpFieldResolve } from '@/components/OaApproval/hooks/useErpFieldResolve';
import { checkCondition } from '../../Form/components/ConditionalFieldWrapper';
import styles from '../index.less';

interface ApprovalDetailPanelProps {
  detailLoading: boolean;
  detail: ApprovalDetail | null;
  viewMode: ViewMode;
  onApprove: () => void;
  onReject: () => void;
  onWithdraw: () => void;
  onTransfer: () => void;
}

/** 渲染状态标签 */
const renderStatusTag = (status: string) => (
  <Tag color={STATUS_COLORS[status as keyof typeof STATUS_COLORS] || 'default'}>
    {STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status}
  </Tag>
);

/** 渲染紧急程度标签 */
const renderUrgencyTag = (urgency: string) => {
  if (urgency === 'normal') return null;
  return (
    <Tag color={URGENCY_COLORS[urgency as keyof typeof URGENCY_COLORS]}>
      {URGENCY_LABELS[urgency as keyof typeof URGENCY_LABELS]}
    </Tag>
  );
};

const ApprovalDetailPanel: React.FC<ApprovalDetailPanelProps> = ({
  detailLoading, detail, viewMode, onApprove, onReject, onWithdraw, onTransfer,
}) => {
  if (detailLoading) {
    return (
      <div className={styles.detailPanel}>
        <div className={styles.loadingContainer}><Spin /></div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className={styles.detailPanel}>
        <Empty description="请选择审批单查看详情" />
      </div>
    );
  }

  // 批量预解析 ERP 字段 ID
  const { resolvedMap } = useErpFieldResolve(detail?.formSchema, detail?.formData);

  // 计算当前步骤索引
  const currentStep = detail.nodes.findIndex(n => n.status === 'pending');

  return (
    <div className={styles.detailPanel}>
      {/* 头部信息 */}
      <div className={styles.detailHeader}>
        <h2 className={styles.detailTitle}>{detail.formTypeName}</h2>
        <div className={styles.detailMeta}>
          <span>编号: {detail.instanceNo}</span>
          <span>申请人: {detail.applicantName}</span>
          <span>部门: {detail.applicantDept || '-'}</span>
        </div>
        <div className={styles.detailStatus}>
          {renderStatusTag(detail.status)}
          {renderUrgencyTag(detail.urgency)}
        </div>
      </div>

      {/* 表单数据 */}
      <div className={styles.formDataSection}>
        <h3>表单数据</h3>
        <div className={styles.formDataList}>
          {detail.formSchema?.fields?.map((field) => {
            const value = detail.formData[field.key];
            // 条件显示：不满足条件时隐藏字段
            if (field.visibleWhen && !checkCondition(field.visibleWhen, detail.formData)) {
              return null;
            }
            // 跳过内部字段（以下划线开头）
            if (field.key.startsWith('_')) return null;
            return (
              <div key={field.key} className={styles.formDataRow}>
                <span className={styles.formLabel}>{field.label}</span>
                <span className={styles.formValue}>
                  <FieldRenderer field={field} value={value} formData={detail.formData} resolvedMap={resolvedMap} />
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 审批流程 */}
      <div className={styles.flowSection}>
        <h3>审批流程</h3>
        <ApprovalFlow
          nodes={detail.nodes}
          ccUsers={detail.ccUsers}
          currentStep={currentStep}
          instanceStatus={detail.status}
        />
      </div>

      {/* 操作区 */}
      {viewMode === 'pending' && detail.status === 'pending' && (
        <div className={styles.actionBar}>
          <div className={styles.actionLeft}>
            <Button icon={<SwapOutlined />} onClick={onTransfer}>转交</Button>
            <Tooltip title="功能开发中">
              <Button icon={<TeamOutlined />} disabled>加签</Button>
            </Tooltip>
            <Tooltip title="功能开发中">
              <Button icon={<MessageOutlined />} disabled>评论</Button>
            </Tooltip>
          </div>
          <div className={styles.actionRight}>
            <Button danger onClick={onReject}>拒绝</Button>
            <Button type="primary" onClick={onApprove}>同意</Button>
          </div>
        </div>
      )}

      {/* 撤回按钮 */}
      {viewMode === 'my' && detail.status === 'pending' && (
        <div className={styles.actionBar}>
          <Popconfirm title="确定要撤回此审批吗？" onConfirm={onWithdraw} okText="确定" cancelText="取消">
            <Button danger>撤回审批</Button>
          </Popconfirm>
        </div>
      )}
    </div>
  );
};

export default ApprovalDetailPanel;
