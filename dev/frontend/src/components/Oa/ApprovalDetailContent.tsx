/**
 * OA 审批详情共享内容组件
 * 供 Oa/Detail 独立页面和 Oa/Center 流程中心面板复用
 * 负责：头部信息 + 表单渲染（list/descriptions 两种布局）+ 审批流程 + 操作栏 + ActionModal
 */
import React from 'react';
import { Button, Popconfirm, Tooltip, Dropdown, Card, Descriptions } from 'antd';
import {
  SwapOutlined, TeamOutlined, MessageOutlined,
  MoreOutlined, RollbackOutlined, SaveOutlined, CheckOutlined,
} from '@ant-design/icons';
import type { ApprovalDetail } from '@/types/oa';
import { ApprovalStatusTag, ApprovalFlow, FormFieldRenderer } from '@/components/Oa';
import FormFieldsDiff, { hasOriginalFields } from './FormFieldsDiff';
import { useErpFieldResolve } from './hooks/useErpFieldResolve';
import { useErpLicenseResolve } from './hooks/useErpLicenseResolve';
import ActionModal from './ActionModal';
import { getInteractionType } from '@/utils/oa';
import { checkCondition } from '@/pages/Oa/Form/components/ConditionalFieldWrapper';
import type { UseApprovalActionsReturn } from './hooks/useApprovalActions';
import styles from './ApprovalDetailContent.less';

export interface ApprovalDetailContentProps {
  detail: ApprovalDetail;
  actionState: UseApprovalActionsReturn;
  formLayout?: 'list' | 'descriptions';
  extraContentBefore?: React.ReactNode;
  className?: string;
  /** 外部覆盖 canOperate（Center 根据 viewMode 计算） */
  canOperateOverride?: boolean;
  /** 外部覆盖 canWithdraw（Center 根据 viewMode 计算） */
  canWithdrawOverride?: boolean;
  /** 是否显示头部信息（Detail 页面有自己的 pageHeader，传 false 避免重复） */
  showHeader?: boolean;
}

// ==================== 头部信息 ====================

const DetailHeader: React.FC<{ detail: ApprovalDetail }> = ({ detail }) => (
  <div className={styles.detailHeader}>
    <h2 className={styles.detailTitle}>{detail.formTypeName}</h2>
    <div className={styles.detailMeta}>
      <span>编号: {detail.instanceNo}</span>
      <span>申请人: {detail.applicantName}</span>
      <span>部门: {detail.applicantDept || '-'}</span>
    </div>
    <div className={styles.detailTags}>
      <ApprovalStatusTag status={detail.status} />
    </div>
  </div>
);

// ==================== 表单字段渲染 ====================

const FormFieldsSection: React.FC<{
  detail: ApprovalDetail;
  layout: 'list' | 'descriptions';
  resolvedMap: Record<string, string>;
  erpLicenseUrls: string[];
}> = ({ detail, layout, resolvedMap, erpLicenseUrls }) => {
  const renderField = (field: any, value: any) => (
    <FormFieldRenderer field={field} value={value} formData={detail.formData} resolvedMap={resolvedMap} erpLicenseUrls={erpLicenseUrls} />
  );

  const filteredFields = detail.formSchema?.fields?.filter((field: any) => {
    if (field.visibleWhen && !checkCondition(field.visibleWhen, detail.formData)) return false;
    if (field.key.startsWith('_')) return false;
    return true;
  }) || [];

  if (hasOriginalFields(detail.formData)) {
    const diffProps = { formSchema: detail.formSchema, formData: detail.formData, resolvedMap, erpLicenseUrls };
    if (layout === 'descriptions') {
      return (
        <Card title="表单内容" className={styles.card}>
          <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
            <FormFieldsDiff {...diffProps} layout="descriptions" />
          </Descriptions>
        </Card>
      );
    }
    return (
      <div className={styles.formDataSection}>
        <h3>表单数据</h3>
        <div className={styles.formDataList}>
          <FormFieldsDiff {...diffProps} layout="list" />
        </div>
      </div>
    );
  }

  if (layout === 'descriptions') {
    return (
      <Card title="表单内容" className={styles.card}>
        <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
          {filteredFields.map((field: any) => (
            <Descriptions.Item key={field.key} label={field.label}>
              {renderField(field, detail.formData[field.key])}
            </Descriptions.Item>
          ))}
        </Descriptions>
      </Card>
    );
  }

  return (
    <div className={styles.formDataSection}>
      <h3>表单数据</h3>
      <div className={styles.formDataList}>
        {filteredFields.map((field: any) => (
          <div key={field.key} className={styles.formDataRow}>
            <span className={styles.formLabel}>{field.label}</span>
            <span className={styles.formValue}>
              {renderField(field, detail.formData[field.key])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==================== 操作栏 ====================

const ActionBar: React.FC<{
  detail: ApprovalDetail;
  interactionType: 'approval' | 'operation';
  canOperate: boolean;
  canWithdraw: boolean;
  canComment: boolean;
  onOpenAction: (type: 'approve' | 'reject' | 'transfer' | 'countersign' | 'update' | 'comment') => void;
  onWithdraw: () => void;
}> = ({ detail, interactionType, canOperate, canWithdraw, canComment, onOpenAction, onWithdraw }) => {

  if (canOperate) {
    if (interactionType === 'operation') {
      return (
        <div className={styles.actionBar}>
          <div className={styles.actionLeft}>
            {canComment && (
              <Button onClick={() => onOpenAction('comment')}>评论</Button>
            )}
            <Dropdown menu={{
              items: [
                { key: 'rollback', icon: <RollbackOutlined />, label: '退回', onClick: () => onOpenAction('reject') },
                { key: 'transfer', icon: <SwapOutlined />, label: '转交', onClick: () => onOpenAction('transfer') },
              ],
            }}>
              <Button icon={<MoreOutlined />}>更多</Button>
            </Dropdown>
          </div>
          <div className={styles.actionRight}>
            <Button icon={<SaveOutlined />} onClick={() => onOpenAction('update')}>更新</Button>
            <Button type="primary" icon={<CheckOutlined />} onClick={() => onOpenAction('approve')}>完成</Button>
          </div>
        </div>
      );
    }
    return (
      <div className={styles.actionBar}>
        <div className={styles.actionLeft}>
          <Button icon={<SwapOutlined />} onClick={() => onOpenAction('transfer')}>转交</Button>
          <Tooltip title="功能开发中"><Button icon={<TeamOutlined />} disabled>加签</Button></Tooltip>
          {canComment && (
            <Button onClick={() => onOpenAction('comment')}>评论</Button>
          )}
        </div>
        <div className={styles.actionRight}>
          <Button danger onClick={() => onOpenAction('reject')}>驳回</Button>
          <Button type="primary" onClick={() => onOpenAction('approve')}>同意</Button>
        </div>
      </div>
    );
  }

  // 申请人或非当前审批人但有评论权限时，只显示评论按钮
  if (canComment) {
    return (
      <div className={styles.actionBar}>
        <div className={styles.actionLeft}>
          <Button onClick={() => onOpenAction('comment')}>评论</Button>
        </div>
        <div className={styles.actionRight} />
      </div>
    );
  }

  if (canWithdraw) {
    return (
      <div className={styles.actionBar}>
        <Popconfirm title="确定要撤回此审批吗？" onConfirm={onWithdraw} okText="确定" cancelText="取消">
          <Button danger>撤回审批</Button>
        </Popconfirm>
      </div>
    );
  }

  return null;
};

// ==================== 主组件 ====================

const ApprovalDetailContent: React.FC<ApprovalDetailContentProps> = ({
  detail, actionState, formLayout = 'list', extraContentBefore, className,
  canOperateOverride, canWithdrawOverride, showHeader = true,
}) => {
  const { resolvedMap } = useErpFieldResolve(detail.formSchema, detail.formData);
  const { erpLicenseUrls } = useErpLicenseResolve(detail.formSchema, detail.formData);
  const interactionType = getInteractionType(detail);

  return (
    <div className={`${styles.content} ${className || ''}`}>
      {showHeader && <DetailHeader detail={detail} />}
      {extraContentBefore}
      <FormFieldsSection detail={detail} layout={formLayout} resolvedMap={resolvedMap} erpLicenseUrls={erpLicenseUrls} />
      <div className={styles.flowSection}>
        <h3>审批流程</h3>
        <ApprovalFlow
          nodes={detail.nodes} ccUsers={detail.ccUsers} currentStep={actionState.currentStep}
          instanceStatus={detail.status} actions={detail.actions} erpMeta={detail.erpMeta}
          instanceId={detail.id} applicantName={detail.applicantName}
          applicantAvatar={detail.applicantAvatar} submittedAt={detail.submittedAt}
        />
      </div>
      <ActionBar
        detail={detail}
        interactionType={interactionType}
        canOperate={canOperateOverride !== undefined ? canOperateOverride : actionState.canOperate}
        canWithdraw={canWithdrawOverride !== undefined ? canWithdrawOverride : actionState.canWithdraw}
        canComment={actionState.canComment}
        onOpenAction={actionState.openActionModal} onWithdraw={actionState.executeWithdraw}
      />
      <ActionModal
        visible={actionState.actionModalVisible} actionType={actionState.actionType}
        actionComment={actionState.actionComment} actionLoading={actionState.actionLoading}
        transferUsers={actionState.transferUsers} interactionType={interactionType}
        onOk={actionState.executeAction} onCancel={actionState.closeActionModal}
        onCommentChange={actionState.setActionComment} onTransferUserChange={actionState.setTransferUserId}
      />
    </div>
  );
};

export default ApprovalDetailContent;
