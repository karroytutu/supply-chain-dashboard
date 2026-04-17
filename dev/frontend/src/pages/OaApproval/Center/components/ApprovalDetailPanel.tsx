import React from 'react';
import { Spin, Empty, Tag, Button, Popconfirm } from 'antd';
import {
  UserOutlined,
  RollbackOutlined,
  TeamOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import type { ApprovalDetail, ViewMode } from '@/types/oa-approval';
import { STATUS_LABELS, STATUS_COLORS, URGENCY_LABELS, URGENCY_COLORS } from '@/types/oa-approval';
import styles from '../index.less';

interface ApprovalDetailPanelProps {
  detailLoading: boolean;
  detail: ApprovalDetail | null;
  viewMode: ViewMode;
  onApprove: () => void;
  onReject: () => void;
  onWithdraw: () => void;
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
  detailLoading, detail, viewMode, onApprove, onReject, onWithdraw,
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

      {/* AI风险检查占位 */}
      <div className={styles.aiRiskCard}>
        <span className={styles.aiIcon}>🤖</span>
        <span>AI风险检查: 低风险</span>
        <Button type="link">详情</Button>
      </div>

      {/* 表单数据 */}
      <div className={styles.formDataSection}>
        <h3>表单数据</h3>
        <div className={styles.formDataList}>
          {Object.entries(detail.formData).map(([key, value]) => (
            <div key={key} className={styles.formDataRow}>
              <span className={styles.formLabel}>{key}</span>
              <span className={styles.formValue}>{String(value)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 流程时间线 */}
      <div className={styles.timelineSection}>
        <h3>流程时间线</h3>
        <div className={styles.timeline}>
          {detail.nodes.map((node) => (
            <div key={node.id} className={styles.timelineItem}>
              <div className={`${styles.timelineDot} ${styles[`timelineDot_${node.status}`]}`}>
                {node.status === 'approved' && '✓'}
                {node.status === 'rejected' && '✗'}
                {node.status === 'pending' && '○'}
              </div>
              <div className={styles.timelineContent}>
                <div className={styles.timelineTitle}>{node.nodeName}</div>
                <div className={styles.timelineInfo}>
                  {node.assignedUserName || '待分配'}
                  {node.status === 'approved' && <Tag color="green" style={{ marginLeft: 8 }}>已通过</Tag>}
                  {node.status === 'rejected' && <Tag color="red" style={{ marginLeft: 8 }}>已拒绝</Tag>}
                </div>
                {node.comment && <div className={styles.timelineComment}>意见: {node.comment}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 操作区 */}
      {viewMode === 'pending' && detail.status === 'pending' && (
        <div className={styles.actionBar}>
          <div className={styles.actionLeft}>
            <Button icon={<UserOutlined />}>转交</Button>
            <Button icon={<RollbackOutlined />}>退回</Button>
            <Button icon={<TeamOutlined />}>加签</Button>
            <Button icon={<MessageOutlined />}>评论</Button>
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
