import React from 'react';
import type { ApprovalNode, ApprovalAction, ErpMeta } from '@/types/oa';
import { ACTION_TYPE_CONFIG } from './flow-types';
import ErpStep from './ErpStep';
import styles from './ApprovalFlow.less';

interface TimelineApprovalGroupProps {
  nodes: ApprovalNode[];
  actions?: ApprovalAction[];
  erpMeta?: ErpMeta | null;
  instanceId?: number;
}

/** 渲染单条操作记录 */
export function ActionEntry({ action }: { action: ApprovalAction }) {
  const config = ACTION_TYPE_CONFIG[action.actionType];
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
 * 统一评论模型后，节点标题行已由 TimelineItem 渲染（Name + Role + Status + Time）
 * 此组件仅渲染：node.comment（历史兼容）+ 操作记录（非 comment 类型）
 */
const TimelineApprovalGroup: React.FC<TimelineApprovalGroupProps> = ({
  nodes,
  actions = [],
  erpMeta,
  instanceId,
}) => {
  return (
    <div className={styles.timelineApprovalGroup}>
      {nodes.map((node) => (
        <div key={node.id} className={styles.timelineApprovalNode}>
          {/* node.comment 历史数据兼容渲染（deprecated，统一评论模型后不再写入） */}
          {node.comment && (
            <div className={styles.timelineCommentLegacy}>{node.comment}</div>
          )}

          {node.nodeType === 'auto' && erpMeta && (
            <ErpStep erpMeta={erpMeta} instanceId={instanceId} />
          )}
        </div>
      ))}

      {/* 非 comment 类型的操作记录（如 submit 等，大部分已不再渲染） */}
      {actions.length > 0 && (
        <div className={styles.timelineActionList}>
          {actions.map((action) => (
            <ActionEntry key={action.id} action={action} />
          ))}
        </div>
      )}
    </div>
  );
};

export default TimelineApprovalGroup;
