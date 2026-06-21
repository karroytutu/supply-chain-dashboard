/**
 * OA 审批详情共享内容组件
 * 供 Oa/Detail 独立页面和 Oa/Center 流程中心面板复用
 * 负责：头部信息 + 表单渲染（list/descriptions 两种布局）+ 审批流程 + 操作栏 + ActionModal
 */
import React from 'react';
import { Card, Descriptions } from 'antd';
import type { ApprovalDetail } from '@/types/oa';
import { ApprovalStatusTag, ApprovalFlow, FormFieldRenderer } from '@/components/Oa';
import FormFieldsDiff, { hasOriginalFields } from './FormFieldsDiff';
import EditableFormSection, { type EditableFormSectionRef } from './EditableFormSection';
import { useErpFieldResolve } from './hooks/useErpFieldResolve';
import { useErpLicenseResolve } from './hooks/useErpLicenseResolve';
import ActionBar from './ActionBar';
import ActionModal from './ActionModal';
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
  /** 可编辑表单 ref（操作型节点时传入，用于获取表单编辑值和校验） */
  editableFormRef?: React.RefObject<EditableFormSectionRef>;
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
    if (field.hidden) return false;
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

// ==================== 主组件 ====================

const ApprovalDetailContent: React.FC<ApprovalDetailContentProps> = ({
  detail, actionState, formLayout = 'list', extraContentBefore, className,
  canOperateOverride, canWithdrawOverride, showHeader = true, editableFormRef,
}) => {
  const { resolvedMap } = useErpFieldResolve(detail.formSchema, detail.formData);
  const { erpLicenseUrls } = useErpLicenseResolve(detail.formSchema, detail.formData);

  // 计算当前节点是否可操作（与 ActionBar 保持一致的逻辑）
  const canOperate = canOperateOverride !== undefined ? canOperateOverride : actionState.canOperate;

  // 从 workflowDef 提取当前节点的字段权限和选项过滤
  const currentNode = detail.nodes.find(n => n.nodeOrder === detail.currentNodeOrder);
  const workflowNode = detail.workflowDef?.nodes.find(n => n.order === currentNode?.nodeOrder);
  // 合并字段权限：代码定义（默认值） + DB 覆盖值（管理员配置优先）
  const codePermissions = workflowNode?.fieldPermissions || {};
  const dbOverrides = detail.fieldPermissions?.nodes?.[String(currentNode?.nodeOrder)] || {};
  const fieldPermissions = { ...codePermissions, ...dbOverrides };
  const fieldOptionFilter = workflowNode?.fieldOptionFilter;
  const nodeType = workflowNode?.type ?? 'approval';

  // 办理型节点 + 可操作时进入编辑模式（fieldPermissions 可选，未配置时所有字段默认为只读）
  const isEditable = nodeType === 'handle' && canOperate;

  return (
    <div className={`${styles.content} ${className || ''}`}>
      {showHeader && <DetailHeader detail={detail} />}
      {extraContentBefore}
      {isEditable ? (
        <EditableFormSection
          ref={editableFormRef}
          formSchema={detail.formSchema}
          formData={detail.formData}
          fieldPermissions={fieldPermissions}
          fieldOptionFilter={fieldOptionFilter}
          resolvedMap={resolvedMap}
          erpLicenseUrls={erpLicenseUrls}
          layout={formLayout}
        />
      ) : (
        <FormFieldsSection detail={detail} layout={formLayout} resolvedMap={resolvedMap} erpLicenseUrls={erpLicenseUrls} />
      )}
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
        nodeType={nodeType}
        canOperate={canOperate}
        canWithdraw={canWithdrawOverride !== undefined ? canWithdrawOverride : actionState.canWithdraw}
        canComment={actionState.canComment}
        onOpenAction={actionState.openActionModal} onWithdraw={actionState.executeWithdraw}
      />
      <ActionModal
        visible={actionState.actionModalVisible} actionType={actionState.actionType}
        actionComment={actionState.actionComment} actionLoading={actionState.actionLoading}
        transferUsers={actionState.transferUsers} nodeType={nodeType}
        countersignUserIds={actionState.countersignUserIds}
        countersignType={actionState.countersignType}
        onCountersignUserIdsChange={actionState.setCountersignUserIds}
        onCountersignTypeChange={actionState.setCountersignType}
        onOk={actionState.executeAction} onCancel={actionState.closeActionModal}
        onCommentChange={actionState.setActionComment} onTransferUserChange={actionState.setTransferUserId}
      />
    </div>
  );
};

export default ApprovalDetailContent;
