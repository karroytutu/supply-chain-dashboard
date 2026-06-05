import React from 'react';
import { Tag } from 'antd';
import type { ApprovalNode, ApprovalAction, ErpMeta } from '@/types/oa';
import { NODE_STATUS_TEXT, ACTION_TYPE_CONFIG } from './flow-types';
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
          <div className={styles.timelineApprovalBody}>
            <span className={styles.timelineApprovalOperator}>
              {node.nodeType === 'auto'
                ? node.nodeName || '系统自动执行'
                : node.assignedUserName || '待分配'}
            </span>
            {node.isCountersign && (
              <Tag color="purple" className={styles.nodeTypeTag}>
                加签
              </Tag>
            )}
            <span className={styles.timelineApprovalStatus}>
              {NODE_STATUS_TEXT[node.status] || node.status}
            </span>
          </div>

          {node.comment && (
            <div className={styles.timelineComment}>{node.comment}</div>
          )}

          {node.nodeType === 'auto' && erpMeta && (
            <ErpStep erpMeta={erpMeta} instanceId={instanceId} />
          )}
        </div>
      ))}

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
