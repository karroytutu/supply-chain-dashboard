import React from 'react';
import type { ApprovalNode, ApprovalAction } from '@/types/oa';
import { ACTION_TYPE_CONFIG } from './flow-types';
import styles from './ApprovalFlow.less';

interface TimelineApprovalGroupProps {
  nodes: ApprovalNode[];
  actions?: ApprovalAction[];
}

/** 渲染单条操作记录 */
export function ActionEntry({ action }: { action: ApprovalAction }) {
  const config = ACTION_TYPE_CONFIG[action.actionType];

  // 交接类型：从 details 中提取结构化交接信息展示
  if (action.actionType === 'handover' && action.details) {
    const { sourceUserName, targetUserName, operatorName } = action.details as {
      sourceUserName?: string;
      targetUserName?: string;
      operatorName?: string;
    };
    return (
      <div key={action.id} className={styles.timelineActionEntry}>
        <span className={config?.cls || styles.actionTagSubmit}>
          {config?.label || action.actionType}
        </span>
        <span className={styles.timelineHandoverDetail}>
          管理员{operatorName}将审批人从{sourceUserName}交接给{targetUserName}
        </span>
      </div>
    );
  }

  return (
    <div key={action.id} className={styles.timelineActionEntry}>
      <span className={config?.cls || styles.actionTagSubmit}>
        {config?.label || action.actionType}
      </span>
      {action.comment && (
        <span className={styles.timelineActionComment}>{action.comment}</span>
      )}
    </div>
  );
}

/**
 * 审批节点组内容渲染
 * 统一评论模型后，节点标题行已由 NodeHeader 渲染（Name + Role + Status + Time）
 * 此组件仅渲染：非冗余操作记录（转交、加签、交接等）
 */
const TimelineApprovalGroup: React.FC<TimelineApprovalGroupProps> = ({
  nodes,
  actions = [],
}) => {
  // 过滤掉与标题行状态重复的 approve/reject 操作（仅保留有附加信息的操作如转交、加签等）
  const displayActions = actions.filter(a =>
    a.actionType !== 'approve' && a.actionType !== 'reject'
  );

  if (displayActions.length === 0) return null;

  return (
    <div className={styles.timelineApprovalGroup}>
      <div className={styles.timelineActionList}>
        {displayActions.map((action) => (
          <ActionEntry key={action.id} action={action} />
        ))}
      </div>
    </div>
  );
};

export default TimelineApprovalGroup;
