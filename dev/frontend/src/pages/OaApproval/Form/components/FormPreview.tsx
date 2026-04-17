import React from 'react';
import type { WorkflowNodeDef } from '@/types/oa-approval';
import styles from '../index.less';

interface FormPreviewProps {
  nodes: WorkflowNodeDef[];
}

/** 流程预览组件 */
const FormPreview: React.FC<FormPreviewProps> = ({ nodes }) => {
  return (
    <div className={styles.workflowPreview}>
      <div className={styles.workflowTitle}>
        <span>流程</span>
        <span className={styles.autoDecision}>
          <span className={styles.checkIcon}>✓</span> 已启用自动决策
        </span>
      </div>
      <div className={styles.nodesList}>
        {nodes.map((node, index) => (
          <div key={node.order} className={styles.nodeItem}>
            <div className={styles.nodeOrder}>{node.order}</div>
            <div className={styles.nodeContent}>
              <div className={styles.nodeName}>{node.name}</div>
              <div className={styles.nodeType}>
                {node.type === 'dynamic_supervisor' && '直属主管审批'}
                {node.type === 'role' && `${node.roleCode} 审批`}
                {node.type === 'specific_user' && '指定用户审批'}
                {node.condition && (
                  <span className={styles.conditionLabel}>
                    (条件: {node.condition.field} {node.condition.operator} {node.condition.value})
                  </span>
                )}
              </div>
            </div>
            {index < nodes.length - 1 && <div className={styles.nodeConnector} />}
          </div>
        ))}
      </div>
    </div>
  );
};

export default FormPreview;
