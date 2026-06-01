import React from 'react';
import { Spin, Empty, Tag, Button, Popconfirm, Tooltip } from 'antd';
import {
  SwapOutlined,
  TeamOutlined,
  MessageOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import {
  type ApprovalDetail,
  type ViewMode,
  STATUS_LABELS,
  STATUS_COLORS,
} from '@/types/oa-approval';
import ApprovalFlow from '@/components/OaApproval/ApprovalFlow';
import { FormFieldRenderer as FieldRenderer } from '@/components/OaApproval';
import FormFieldsDiff, { hasOriginalFields } from '@/components/OaApproval/FormFieldsDiff';
import { useErpFieldResolve } from '@/components/OaApproval/hooks/useErpFieldResolve';
import { useErpLicenseResolve } from '@/components/OaApproval/hooks/useErpLicenseResolve';
import { usePermission } from '@/hooks/usePermission';
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
  isMobile?: boolean;
  onBack?: () => void;
}

/** 渲染状态标签 */
const renderStatusTag = (status: string) => (
  <Tag color={STATUS_COLORS[status as keyof typeof STATUS_COLORS] || 'default'}>
    {STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status}
  </Tag>
);

/** 表单字段渲染（支持变更对比） */
const FormFieldsList: React.FC<{ detail: ApprovalDetail; resolvedMap: Record<string, string>; erpLicenseUrls: string[] }> = ({
  detail, resolvedMap, erpLicenseUrls,
}) => (
  <div className={styles.formDataSection}>
    <h3>表单数据</h3>
    <div className={styles.formDataList}>
      {hasOriginalFields(detail.formData) ? (
        <FormFieldsDiff
          formSchema={detail.formSchema}
          formData={detail.formData}
          resolvedMap={resolvedMap}
          erpLicenseUrls={erpLicenseUrls}
          layout="list"
        />
      ) : (
        detail.formSchema?.fields?.map((field) => {
          const value = detail.formData[field.key];
          if (field.visibleWhen && !checkCondition(field.visibleWhen, detail.formData)) return null;
          if (field.key.startsWith('_')) return null;
          return (
            <div key={field.key} className={styles.formDataRow}>
              <span className={styles.formLabel}>{field.label}</span>
              <span className={styles.formValue}>
                <FieldRenderer field={field} value={value} formData={detail.formData} resolvedMap={resolvedMap} erpLicenseUrls={erpLicenseUrls} />
              </span>
            </div>
          );
        })
      )}
    </div>
  </div>
);

/** 审批操作区 */
const ActionBar: React.FC<{
  viewMode: ViewMode;
  detail: ApprovalDetail;
  currentUserId: number | undefined;
  onApprove: () => void;
  onReject: () => void;
  onWithdraw: () => void;
  onTransfer: () => void;
}> = ({
  viewMode, detail, currentUserId, onApprove, onReject, onWithdraw, onTransfer,
}) => {
  // 当前用户是否是当前流程节点的审批人（基于 currentNodeOrder 精确定位）
  const currentNode = detail.nodes.find((n) => n.nodeOrder === detail.currentNodeOrder);
  const isCurrentApprover = currentNode?.assignedUserId === currentUserId;
  // 当前用户是否是申请人
  const isApplicant = detail.applicantId === currentUserId;

  return (
    <>
      {viewMode === 'pending' && detail.status === 'pending' && isCurrentApprover && (
        <div className={styles.actionBar}>
          <div className={styles.actionLeft}>
            <Button icon={<SwapOutlined />} onClick={onTransfer}>转交</Button>
            <Tooltip title="功能开发中"><Button icon={<TeamOutlined />} disabled>加签</Button></Tooltip>
            <Tooltip title="功能开发中"><Button icon={<MessageOutlined />} disabled>评论</Button></Tooltip>
          </div>
          <div className={styles.actionRight}>
            <Button danger onClick={onReject}>拒绝</Button>
            <Button type="primary" onClick={onApprove}>同意</Button>
          </div>
        </div>
      )}
      {viewMode === 'my' && detail.status === 'pending' && isApplicant && (
        <div className={styles.actionBar}>
          <Popconfirm title="确定要撤回此审批吗？" onConfirm={onWithdraw} okText="确定" cancelText="取消">
            <Button danger>撤回审批</Button>
          </Popconfirm>
        </div>
      )}
    </>
  );
};

/** 详情内容（detail 非 null 时渲染） */
const DetailContent: React.FC<{
  detail: ApprovalDetail; viewMode: ViewMode;
  onApprove: () => void; onReject: () => void; onWithdraw: () => void; onTransfer: () => void;
  isMobile?: boolean; onBack?: () => void;
}> = ({ detail, viewMode, onApprove, onReject, onWithdraw, onTransfer, isMobile, onBack }) => {
  const { currentUser } = usePermission();
  const { resolvedMap } = useErpFieldResolve(detail.formSchema, detail.formData);
  const { erpLicenseUrls } = useErpLicenseResolve(detail.formSchema, detail.formData);
  const currentStep = detail.nodes.findIndex(n => n.status === 'pending');

  return (
    <div className={styles.detailPanel}>
      {isMobile && (
        <div className={styles.mobileBackBar}>
          <ArrowLeftOutlined onClick={onBack} style={{ fontSize: 16, cursor: 'pointer' }} />
          <span className={styles.mobileBackTitle}>{detail.formTypeName}</span>
        </div>
      )}
      <div className={styles.detailScroll}>
        <div className={styles.detailHeader}>
          <h2 className={styles.detailTitle}>{detail.formTypeName}</h2>
          <div className={styles.detailMeta}>
            <span>编号: {detail.instanceNo}</span>
            <span>申请人: {detail.applicantName}</span>
            <span>部门: {detail.applicantDept || '-'}</span>
          </div>
          <div className={styles.detailStatus}>
            {renderStatusTag(detail.status)}
          </div>
        </div>
        <FormFieldsList detail={detail} resolvedMap={resolvedMap} erpLicenseUrls={erpLicenseUrls} />
        <div className={styles.flowSection}>
          <h3>审批流程</h3>
          <ApprovalFlow
            nodes={detail.nodes} ccUsers={detail.ccUsers} currentStep={currentStep}
            instanceStatus={detail.status} erpMeta={detail.erpMeta} instanceId={detail.id}
            applicantName={detail.applicantName}
            applicantAvatar={detail.applicantAvatar} submittedAt={detail.submittedAt}
          />
        </div>
      </div>
      <ActionBar viewMode={viewMode} detail={detail} currentUserId={currentUser?.id}
        onApprove={onApprove} onReject={onReject} onWithdraw={onWithdraw} onTransfer={onTransfer} />
    </div>
  );
};

const ApprovalDetailPanel: React.FC<ApprovalDetailPanelProps> = ({
  detailLoading, detail, viewMode, onApprove, onReject, onWithdraw, onTransfer, isMobile, onBack,
}) => {
  if (detailLoading) {
    return <div className={styles.detailPanel}><div className={styles.loadingContainer}><Spin /></div></div>;
  }
  if (!detail) {
    return <div className={styles.detailPanel}><Empty description="请选择审批单查看详情" /></div>;
  }
  return (
    <DetailContent detail={detail} viewMode={viewMode}
      onApprove={onApprove} onReject={onReject} onWithdraw={onWithdraw} onTransfer={onTransfer}
      isMobile={isMobile} onBack={onBack} />
  );
};

export default ApprovalDetailPanel;
