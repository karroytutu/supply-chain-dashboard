import React from 'react';
import { ApprovalDetailContent } from '@/components/OaApproval';
import type { ApprovalDetail } from '@/types/oa-approval';
import styles from '../index.less';

interface ApprovalDetailPanelProps {
  detailLoading: boolean;
  detail: ApprovalDetail | null;
  canOperate: boolean;
  canWithdraw: boolean;
  onApprove: (comment: string) => Promise<void>;
  onReject: (comment: string) => Promise<void>;
  onTransfer: (userId: number, comment: string) => Promise<void>;
  onWithdraw: () => Promise<void>;
}

/** 审批中心右侧详情面板（薄包装 ApprovalDetailContent） */
const ApprovalDetailPanel: React.FC<ApprovalDetailPanelProps> = ({
  detailLoading, detail, canOperate, canWithdraw,
  onApprove, onReject, onTransfer, onWithdraw,
}) => (
  <div className={styles.detailPanel}>
    <ApprovalDetailContent
      detail={detail}
      loading={detailLoading}
      canOperate={canOperate}
      canWithdraw={canWithdraw}
      onApprove={onApprove}
      onReject={onReject}
      onTransfer={onTransfer}
      onWithdraw={onWithdraw}
    />
  </div>
);

export default ApprovalDetailPanel;
