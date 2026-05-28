import React, { useState, useCallback } from 'react';
import { Spin, Empty, Button, Popconfirm, Tooltip, message } from 'antd';
import {
  SwapOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { ApprovalDetail } from '@/types/oa-approval';
import { ApprovalStatusTag, ApprovalFlow, FormFieldRenderer } from '@/components/OaApproval';
import { useErpFieldResolve } from './hooks/useErpFieldResolve';
import { useErpLicenseResolve } from './hooks/useErpLicenseResolve';
import ActionModal from './ActionModal';
import { checkCondition } from '@/pages/OaApproval/Form/components/ConditionalFieldWrapper';
import { oaApprovalApi } from '@/services/api/oa-approval';
import styles from './ApprovalDetailContent.less';

interface ApprovalDetailContentProps {
  /** 审批详情数据 */
  detail: ApprovalDetail | null;
  /** 加载状态 */
  loading: boolean;
  /** 当前用户是否可操作（同意/驳回/转交） */
  canOperate: boolean;
  /** 当前用户是否可撤回 */
  canWithdraw: boolean;
  /** 同意操作 */
  onApprove: (comment: string) => Promise<void>;
  /** 驳回操作 */
  onReject: (comment: string) => Promise<void>;
  /** 转交操作 */
  onTransfer: (userId: number, comment: string) => Promise<void>;
  /** 撤回操作 */
  onWithdraw: () => Promise<void>;
}

/** 审批详情共用内容组件（审批中心面板 & 详情页复用） */
const ApprovalDetailContent: React.FC<ApprovalDetailContentProps> = ({
  detail,
  loading,
  canOperate,
  canWithdraw,
  onApprove,
  onReject,
  onTransfer,
  onWithdraw,
}) => {
  const [actionLoading, setActionLoading] = useState(false);
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'transfer' | null>(null);
  const [actionComment, setActionComment] = useState('');
  const [transferUserId, setTransferUserId] = useState<number | null>(null);
  const [transferUsers, setTransferUsers] = useState<Array<{ id: number; name: string }>>([]);
  const { resolvedMap } = useErpFieldResolve(detail?.formSchema, detail?.formData);
  const { erpLicenseUrls } = useErpLicenseResolve(detail?.formSchema, detail?.formData);

  /** 打开操作弹窗 */
  const openActionModal = useCallback((type: 'approve' | 'reject' | 'transfer') => {
    setActionType(type);
    setActionModalVisible(true);
    setActionComment('');
    setTransferUserId(null);
    if (type === 'transfer') {
      oaApprovalApi.getTransferCandidates()
        .then((users) => setTransferUsers(users))
        .catch(() => setTransferUsers([]));
    }
  }, []);

  /** 执行操作 */
  const handleAction = useCallback(async () => {
    if (!actionType) return;
    if (actionType === 'transfer' && !transferUserId) {
      message.warning('请选择转交人员');
      return;
    }
    setActionLoading(true);
    try {
      switch (actionType) {
        case 'approve':
          await onApprove(actionComment);
          break;
        case 'reject':
          await onReject(actionComment);
          break;
        case 'transfer':
          await onTransfer(transferUserId!, actionComment);
          break;
      }
      setActionModalVisible(false);
      setActionComment('');
      setTransferUserId(null);
    } catch {
      // 各 handler 内部已处理错误提示
    } finally {
      setActionLoading(false);
    }
  }, [actionType, actionComment, transferUserId, onApprove, onReject, onTransfer]);

  /** 关闭弹窗 */
  const closeModal = useCallback(() => {
    setActionModalVisible(false);
    setActionComment('');
    setTransferUserId(null);
  }, []);

  if (loading) {
    return (
      <div className={styles.loadingContainer}><Spin /></div>
    );
  }

  if (!detail) {
    return <Empty description="请选择审批单查看详情" />;
  }

  const currentStep = (() => {
    const pendingIndex = detail.nodes.findIndex(n => n.status === 'pending');
    if (pendingIndex === -1) {
      if (detail.status === 'approved') return detail.nodes.length;
      if (detail.status === 'rejected') return 0;
    }
    return pendingIndex;
  })();

  return (
    <div className={styles.content}>
      {/* 头部信息 */}
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

      {/* 表单数据 */}
      <div className={styles.formDataSection}>
        <h3>表单数据</h3>
        <div className={styles.formDataList}>
          {detail.formSchema?.fields?.map((field) => {
            const value = detail.formData[field.key];
            if (field.visibleWhen && !checkCondition(field.visibleWhen, detail.formData)) {
              return null;
            }
            if (field.key.startsWith('_')) return null;
            return (
              <div key={field.key} className={styles.formDataRow}>
                <span className={styles.formLabel}>{field.label}</span>
                <span className={styles.formValue}>
                  <FormFieldRenderer field={field} value={value} formData={detail.formData} resolvedMap={resolvedMap} erpLicenseUrls={erpLicenseUrls} />
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 审批流程（含时间线 + ERP 节点） */}
      <div className={styles.flowSection}>
        <h3>审批流程</h3>
        <ApprovalFlow
          nodes={detail.nodes}
          ccUsers={detail.ccUsers}
          currentStep={currentStep}
          instanceStatus={detail.status}
          actions={detail.actions}
          erpMeta={detail.erpMeta}
          instanceId={detail.id}
          applicantName={detail.applicantName}
          applicantAvatar={detail.applicantAvatar}
          submittedAt={detail.submittedAt}
        />
      </div>

      {/* 操作栏 */}
      {canOperate && (
        <div className={styles.actionBar}>
          <div className={styles.actionLeft}>
            <Button icon={<SwapOutlined />} onClick={() => openActionModal('transfer')}>转交</Button>
            <Tooltip title="功能开发中">
              <Button icon={<TeamOutlined />} disabled>加签</Button>
            </Tooltip>
          </div>
          <div className={styles.actionRight}>
            <Button danger onClick={() => openActionModal('reject')}>驳回</Button>
            <Button type="primary" onClick={() => openActionModal('approve')}>同意</Button>
          </div>
        </div>
      )}

      {canWithdraw && !canOperate && (
        <div className={styles.actionBar}>
          <Popconfirm title="确定要撤回此审批吗？" onConfirm={onWithdraw} okText="确定" cancelText="取消">
            <Button danger>撤回审批</Button>
          </Popconfirm>
        </div>
      )}

      {/* 操作弹窗 */}
      <ActionModal
        visible={actionModalVisible}
        actionType={actionType}
        actionComment={actionComment}
        actionLoading={actionLoading}
        transferUsers={transferUsers}
        onOk={handleAction}
        onCancel={closeModal}
        onCommentChange={setActionComment}
        onTransferUserChange={setTransferUserId}
      />
    </div>
  );
};

export default ApprovalDetailContent;
