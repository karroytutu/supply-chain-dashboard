/**
 * OA 审批详情共享内容组件
 * 供 Oa/Detail 独立页面和 Oa/Center 流程中心面板复用
 * 负责：头部信息 + 表单渲染（list/descriptions 两种布局）+ 审批流程 + 操作栏 + ActionModal
 */
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Alert, Card, Descriptions, Button, message } from 'antd';
import { ArrowLeftOutlined, ClockCircleOutlined, WarningOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { ApprovalDetail, FieldPermission, FormSchema, ViewPermissionsOverride } from '@/types/oa';
import { ApprovalStatusTag, ApprovalFlow, FormFieldRenderer } from '@/components/Oa';
import FormFieldsDiff, { hasOriginalFields } from './FormFieldsDiff';
import EditableFormSection, { type EditableFormSectionRef } from './EditableFormSection';
import { useErpFieldResolve } from './hooks/useErpFieldResolve';
import { useErpLicenseResolve } from './hooks/useErpLicenseResolve';
import { usePermission } from '@/hooks/usePermission';
import ActionBar from './ActionBar';
import ActionModal from './ActionModal';
import { checkCondition } from '@/pages/Oa/Form/components/ConditionalFieldWrapper';
import { remindNode } from '@/services/api/oa';
import { formatDateTime } from '@/utils/format';
import LicenseDeferredCard from '@/pages/Oa/Detail/components/LicenseDeferredCard';
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
  /** 外部覆盖 withdrawDisabledReason（Center 根据 viewMode 计算） */
  withdrawDisabledReasonOverride?: string;
  /** 是否显示头部信息 */
  showHeader?: boolean;
  /** 传入时头部显示返回按钮（独立详情页传入，流程中心不传） */
  onBack?: () => void;
  /** 可编辑表单 ref（操作型节点时传入，用于获取表单编辑值和校验） */
  editableFormRef?: React.RefObject<EditableFormSectionRef>;
  /** auto 节点重试成功后的回调（触发数据刷新/轮询） */
  onRetrySuccess?: () => void;
}

// ==================== 超时信息条 ====================

const TimeoutInfoBar: React.FC<{
  deadlineAt: string;
  nodeName: string;
  reminderCount: number;
  ccSupervisorAt: string | null;
}> = ({ deadlineAt, nodeName, reminderCount, ccSupervisorAt }) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const now = Date.now();
  const deadline = new Date(deadlineAt).getTime();
  const diff = deadline - now;
  const isOverdue = diff <= 0;

  const absMs = Math.abs(diff);
  const totalMin = Math.floor(absMs / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  const durationText = days > 0 ? `${days}天${hours}小时${minutes}分` : hours > 0 ? `${hours}小时${minutes}分` : `${minutes}分钟`;

  return (
    <Alert
      type={isOverdue ? 'error' : 'warning'}
      showIcon
      icon={isOverdue ? <WarningOutlined /> : <ClockCircleOutlined />}
      message={
        <span>
          当前节点「{nodeName}」{isOverdue ? `已超时 ${durationText}` : `剩余 ${durationText}`}
        </span>
      }
      description={
        <span style={{ fontSize: 12 }}>
          截止时间: {formatDateTime(deadlineAt)}
          {reminderCount > 0 && <span style={{ marginLeft: 12 }}>已催办: {reminderCount}次</span>}
          {ccSupervisorAt && <span style={{ marginLeft: 12, color: '#fa541c' }}>上级已通知</span>}
        </span>
      }
      style={{ marginBottom: 12 }}
    />
  );
};

// ==================== 头部信息 ====================

const DetailHeader: React.FC<{
  detail: ApprovalDetail;
  onBack?: () => void;
}> = ({ detail, onBack }) => (
  <div className={styles.detailHeader}>
    <div className={styles.headerTitleRow}>
      {onBack && (
        <Button type="text" className={styles.backBtn} onClick={onBack} icon={<ArrowLeftOutlined />}>
          返回
        </Button>
      )}
      <h2 className={styles.detailTitle}>{detail.formTypeName}</h2>
      <div className={styles.headerStatus}>
        <ApprovalStatusTag status={detail.status} />
      </div>
    </div>
    <div className={styles.headerInstanceNo}>{detail.instanceNo}</div>
    <div className={styles.headerMeta}>
      {[
        detail.applicantName,
        detail.applicantDept || '-',
        formatDateTime(detail.submittedAt, 'YYYY-MM-DD') + ' 提交',
        detail.completedAt ? formatDateTime(detail.completedAt, 'YYYY-MM-DD') + ' 完成' : null,
      ].filter(Boolean).join(' · ')}
    </div>
  </div>
);

// ==================== 数据层权限过滤 ====================

/**
 * 在数据层一次性过滤字段权限：
 * 1. 从 formSchema.fields 中移除 fieldPermissions[key] === 'hidden' 的字段
 * 2. 表格类型：从 children 中移除 hidden 子字段
 * 3. 从 formData 中移除 hidden 字段对应的数据
 */
function applyFieldPermissions(
  formSchema: FormSchema,
  formData: Record<string, unknown>,
  fieldPermissions?: Record<string, FieldPermission>,
): { formSchema: FormSchema; formData: Record<string, unknown> } {
  if (!fieldPermissions) return { formSchema, formData };

  const filteredFields = formSchema.fields.filter(field => {
    return fieldPermissions[field.key] !== 'hidden';
  }).map(field => {
    // 表格子字段过滤
    if (field.type === 'table' && field.children) {
      const filteredChildren = field.children.filter(
        child => fieldPermissions[`${field.key}.${child.key}`] !== 'hidden'
      );
      return { ...field, children: filteredChildren };
    }
    return field;
  });

  // 从 formData 中移除 hidden 字段的数据
  const hiddenKeys = new Set(
    formSchema.fields
      .filter(f => fieldPermissions[f.key] === 'hidden')
      .map(f => f.key)
  );
  const filteredData = { ...formData };
  for (const key of hiddenKeys) {
    delete filteredData[key];
  }

  return {
    formSchema: { ...formSchema, fields: filteredFields },
    formData: filteredData,
  };
}

// ==================== 查看权限解析 ====================

/**
 * 解析非办理人的查看权限
 *
 * 匹配规则：
 * - 发起人（applicantId === userId）→ 使用 viewPermissions.nodes["0"]
 * - 审批/办理人（node.assignedUserIds 包含 userId）→ 使用对应节点的查看权限
 * - 参与了多个节点 → 取并集（任一节点 readonly 则最终 readonly，否则 hidden）
 * - 数据查看人（用户角色在 dataReadRoles 中，或用户ID在 dataReadUsers 中）→ 使用 viewPermissions.dataRead
 * - 纯抄送人 / 无匹配 / 未配置 → 返回 undefined（调用方负责处理为全隐藏）
 */
function resolveViewPermissions(
  detail: ApprovalDetail,
  userId: number | undefined,
  userRoles: string[] = []
): Record<string, FieldPermission> | undefined {
  if (!userId || !detail.viewPermissions) return undefined;

  // 收集用户参与的节点 order
  const myOrders: string[] = [];
  if (detail.applicantId === userId) myOrders.push('0');
  for (const node of detail.nodes) {
    if (node.assignedUserIds?.includes(userId)) {
      const o = String(node.nodeOrder);
      if (!myOrders.includes(o)) myOrders.push(o);
    }
  }

  if (myOrders.length > 0) {
    // 多节点取并集：任一节点 readonly → 最终 readonly
    const merged: Record<string, FieldPermission> = {};
    for (const field of detail.formSchema.fields) {
      if (field.key.startsWith('_') || field.hidden) continue;
      merged[field.key] = myOrders.some(o =>
        detail.viewPermissions!.nodes?.[o]?.[field.key] === 'readonly'
      ) ? 'readonly' : 'hidden';
      // 表格子字段同理
      if (field.type === 'table' && field.children) {
        for (const child of field.children) {
          if (child.key.startsWith('_') || child.hidden) continue;
          const childKey = `${field.key}.${child.key}`;
          merged[childKey] = myOrders.some(o =>
            detail.viewPermissions!.nodes?.[o]?.[childKey] === 'readonly'
          ) ? 'readonly' : 'hidden';
        }
      }
    }
    return merged;
  }

  // 非流程参与人：检查是否为数据查看人（角色匹配 或 用户ID匹配）
  // 1. 角色匹配
  if (detail.dataReadRoles && detail.dataReadRoles.length > 0 && userRoles.length > 0) {
    const isRoleViewer = detail.dataReadRoles.some(role => userRoles.includes(role));
    if (isRoleViewer && detail.viewPermissions.dataRead) {
      return detail.viewPermissions.dataRead;
    }
  }
  // 2. 用户ID匹配
  if (detail.dataReadUsers && detail.dataReadUsers.length > 0) {
    const isUserViewer = detail.dataReadUsers.includes(userId);
    if (isUserViewer && detail.viewPermissions.dataRead) {
      return detail.viewPermissions.dataRead;
    }
  }

  return undefined; // 无匹配，全隐藏
}

/**
 * 构建全隐藏的权限对象（所有业务字段均为 hidden）
 * 当查看权限未配置且用户非办理人时使用
 */
function buildAllHiddenPermissions(formSchema: FormSchema): Record<string, FieldPermission> {
  const perms: Record<string, FieldPermission> = {};
  for (const field of formSchema.fields) {
    if (field.key.startsWith('_') || field.hidden) continue;
    perms[field.key] = 'hidden';
    if (field.type === 'table' && field.children) {
      for (const child of field.children) {
        if (child.key.startsWith('_') || child.hidden) continue;
        perms[`${field.key}.${child.key}`] = 'hidden';
      }
    }
  }
  return perms;
}

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

  // 查重警告：提取 _duplicateWarning 字段值
  const duplicateWarning = detail.formData?._duplicateWarning as string | undefined;

  // hidden 字段已在数据层 applyFieldPermissions 中过滤，此处仅处理 visibleWhen / _ 前缀 / schema.hidden
  const filteredFields = detail.formSchema?.fields?.filter((field: any) => {
    if (field.visibleWhen && !checkCondition(field.visibleWhen, detail.formData)) return false;
    if (field.key.startsWith('_')) return false;
    if (field.hidden) return false;
    return true;
  }) || [];

  // 查重警告横幅
  const warningBanner = duplicateWarning ? (
    <Alert
      type="warning"
      showIcon
      icon={<WarningOutlined />}
      message="重复申请提示"
      description={<pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13 }}>{duplicateWarning}</pre>}
      style={{ marginBottom: 16 }}
    />
  ) : null;

  if (hasOriginalFields(detail.formData)) {
    const diffProps = { formSchema: detail.formSchema, formData: detail.formData, resolvedMap, erpLicenseUrls };
    if (layout === 'descriptions') {
      return (
        <Card title="表单内容" className={styles.card}>
          {warningBanner}
          <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
            <FormFieldsDiff {...diffProps} layout="descriptions" />
          </Descriptions>
        </Card>
      );
    }
    return (
      <div className={styles.formDataSection}>
        <h3>表单数据</h3>
        {warningBanner}
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
  canOperateOverride, canWithdrawOverride, withdrawDisabledReasonOverride, showHeader = true, onBack, editableFormRef,
  onRetrySuccess,
}) => {
  const { currentUser, roles: userRoles } = usePermission();
  const { resolvedMap } = useErpFieldResolve(detail.formSchema, detail.formData);
  const { erpLicenseUrls } = useErpLicenseResolve(detail.formSchema, detail.formData);

  // 催办处理
  const [remindLoading, setRemindLoading] = useState(false);
  const handleRemind = useCallback(async () => {
    try {
      setRemindLoading(true);
      await remindNode(detail.id);
      message.success('催办通知已发送');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '催办失败';
      message.error(errMsg);
    } finally {
      setRemindLoading(false);
    }
  }, [detail.id]);

  // 计算当前节点是否可操作（与 ActionBar 保持一致的逻辑）
  const canOperate = canOperateOverride !== undefined ? canOperateOverride : actionState.canOperate;

  // === 双层权限解析 ===
  const currentNode = detail.nodes.find(n => n.nodeOrder === detail.currentNodeOrder);
  const workflowNode = detail.workflowDef?.nodes.find(n => n.order === currentNode?.nodeOrder);
  const isCurrentHandler = currentUser?.id != null && currentNode?.assignedUserIds?.includes(currentUser.id) === true;

  // 办理人：使用办理权限；非办理人：使用查看权限
  const fieldPermissions = useMemo(() => {
    if (isCurrentHandler) {
      // 办理权限：DB 为唯一来源
      return detail.fieldPermissions?.nodes?.[String(currentNode?.nodeOrder)];
    }
    // 查看权限：匹配用户参与的节点，取并集；或匹配 dataReadRoles
    const viewPerms = resolveViewPermissions(detail, currentUser?.id, userRoles);
    if (viewPerms) return viewPerms;
    // 未配置查看权限或无匹配节点：全隐藏
    return buildAllHiddenPermissions(detail.formSchema);
  }, [isCurrentHandler, detail, currentNode, currentUser?.id, userRoles]);

  const fieldOptionFilter = workflowNode?.fieldOptionFilter;
  const nodeType = workflowNode?.type ?? 'approval';

  // 办理型节点 + 可操作时进入编辑模式（fieldPermissions 可选，未配置时所有字段默认为只读）
  // 非办理人永远不进入编辑模式
  const isEditable = isCurrentHandler && nodeType === 'handle' && canOperate;

  // 数据层权限过滤：在传给子组件之前一次性过滤 hidden 字段和数据
  const { formSchema: filteredSchema, formData: filteredData } = useMemo(
    () => applyFieldPermissions(detail.formSchema, detail.formData, fieldPermissions),
    [detail.formSchema, detail.formData, fieldPermissions],
  );
  const filteredDetail = useMemo(
    () => ({ ...detail, formSchema: filteredSchema, formData: filteredData }),
    [detail, filteredSchema, filteredData],
  );

  // 权限完整性检查
  const missingPermissions = useMemo(() => {
    if (isCurrentHandler && !detail.fieldPermissions) {
      return { missing: true, description: '该表单尚未配置字段权限，请在「表单管理」页面补充配置。' };
    }
    if (!isCurrentHandler && !detail.viewPermissions) {
      return { missing: true, description: '该表单尚未配置查看权限，请在「表单管理」页面补充配置。非办理人查看时所有字段默认隐藏。' };
    }
    return null;
  }, [isCurrentHandler, detail.fieldPermissions, detail.viewPermissions]);

  // === 额外内容：超时提示 + 催办 + 执照延期 ===
  const pendingNode = detail.nodes?.find(n => n.status === 'pending' && n.deadlineAt);
  const isOverdue = pendingNode?.deadlineAt
    ? new Date(pendingNode.deadlineAt).getTime() < Date.now()
    : false;

  const timeoutSection = pendingNode?.deadlineAt ? (
    <div>
      <TimeoutInfoBar
        deadlineAt={pendingNode.deadlineAt}
        nodeName={pendingNode.nodeName}
        reminderCount={pendingNode.reminderCount ?? 0}
        ccSupervisorAt={pendingNode.ccSupervisorAt ?? null}
      />
      {isOverdue && (
        <Button
          type="primary"
          danger
          size="small"
          icon={<ThunderboltOutlined />}
          loading={remindLoading}
          onClick={handleRemind}
          style={{ marginTop: 8, marginBottom: 12 }}
        >
          手动催办
        </Button>
      )}
    </div>
  ) : null;

  const licenseSection = detail.formTypeCode === 'customer_credit' ? (
    <LicenseDeferredCard
      instanceId={detail.id}
      approvalStatus={detail.status}
      applicantId={detail.applicantId}
      customerId={detail.formData?.customerId as number | undefined}
      cardClassName={styles.card}
    />
  ) : null;

  return (
    <div className={`${styles.content} ${className || ''}`}>
      {showHeader && <DetailHeader detail={detail} onBack={onBack} />}
      {timeoutSection}
      {licenseSection}
      {extraContentBefore}
      {missingPermissions && (
        <Alert
          type="warning"
          message="字段权限配置不完整"
          description={missingPermissions.description}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      {isEditable ? (
        <EditableFormSection
          ref={editableFormRef}
          formSchema={filteredSchema}
          formData={filteredData}
          formTypeCode={detail.formTypeCode}
          fieldPermissions={fieldPermissions}
          fieldOptionFilter={fieldOptionFilter}
          resolvedMap={resolvedMap}
          erpLicenseUrls={erpLicenseUrls}
          layout={formLayout}
        />
      ) : (
        <FormFieldsSection detail={filteredDetail} layout={formLayout} resolvedMap={resolvedMap} erpLicenseUrls={erpLicenseUrls} />
      )}
      <div className={styles.flowSection}>
        <h3>审批流程</h3>
        <ApprovalFlow
          nodes={detail.nodes} ccUsers={detail.ccUsers} currentStep={actionState.currentStep}
          instanceStatus={detail.status} actions={detail.actions} erpMeta={detail.erpMeta}
          instanceId={detail.id} applicantName={detail.applicantName}
          applicantAvatar={detail.applicantAvatar} submittedAt={detail.submittedAt}
          onRetrySuccess={onRetrySuccess}
        />
      </div>
      <ActionBar
        nodeType={nodeType}
        canOperate={canOperate}
        canWithdraw={canWithdrawOverride !== undefined ? canWithdrawOverride : actionState.canWithdraw}
        withdrawDisabledReason={withdrawDisabledReasonOverride ?? actionState.withdrawDisabledReason}
        canComment={actionState.canComment}
        onOpenAction={actionState.openActionModal} onWithdraw={actionState.executeWithdraw}
      />
      <ActionModal
        visible={actionState.actionModalVisible} actionType={actionState.actionType}
        actionComment={actionState.actionComment} actionLoading={actionState.actionLoading}
        attachments={actionState.attachments}
        onAttachmentsChange={actionState.setAttachments}
        transferUsers={actionState.transferUsers} nodeType={nodeType}
        sendBackTargets={actionState.sendBackTargets}
        sendBackTargetNodeOrder={actionState.sendBackTargetNodeOrder}
        onSendBackTargetChange={actionState.setSendBackTargetNodeOrder}
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
