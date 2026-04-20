import React from 'react';
import { Tag } from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  FormOutlined,
} from '@ant-design/icons';
import type { WorkflowNodeDef } from '@/types/oa-approval';
import { getRoleDisplayName, humanizeCondition } from '@/utils/oa-approval';
import styles from '../index.less';

interface FormPreviewProps {
  nodes: WorkflowNodeDef[];
  /** 字段 key → 标签映射，用于条件文本人性化 */
  fieldLabels?: Record<string, string>;
}

/** 节点类型视觉配置 */
const NODE_TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  dynamic_supervisor: { icon: <UserOutlined />, color: '#1890ff' },
  role: { icon: <TeamOutlined />, color: '#722ed1' },
  specific_user: { icon: <UserOutlined />, color: '#52c41a' },
  countersign: { icon: <TeamOutlined />, color: '#fa8c16' },
  data_input: { icon: <FormOutlined />, color: '#13c2c2' },
};

/** 获取节点类型描述文本 */
function getNodeDescription(node: WorkflowNodeDef): string {
  switch (node.type) {
    case 'dynamic_supervisor':
      return '直属主管审批';
    case 'role':
      return `${getRoleDisplayName(node.roleCode || '')}审批`;
    case 'specific_user':
      return '指定用户审批';
    case 'countersign':
      return '会签审批';
    case 'data_input':
      return `${getRoleDisplayName(node.roleCode || '')}录入`;
    default:
      return '';
  }
}

/** 流程预览组件 */
const FormPreview: React.FC<FormPreviewProps> = ({ nodes, fieldLabels }) => {
  const hasConditionalNode = nodes.some((n) => n.condition);
  const config = NODE_TYPE_CONFIG;

  return (
    <div className={styles.workflowPreview}>
      <div className={styles.workflowTitle}>
        <span>流程</span>
        {hasConditionalNode && <Tag color="blue">含条件节点</Tag>}
      </div>
      <div className={styles.nodesList}>
        {nodes.map((node, index) => {
          const typeConfig = config[node.type] || config.role;
          return (
            <div key={node.order} className={styles.nodeItem}>
              <div
                className={styles.nodeIcon}
                style={{ backgroundColor: typeConfig.color }}
              >
                {typeConfig.icon}
              </div>
              <div className={styles.nodeContent}>
                <div className={styles.nodeName}>{node.name}</div>
                <div className={styles.nodeType}>
                  {getNodeDescription(node)}
                  {node.condition && fieldLabels && (
                    <span className={styles.conditionLabel}>
                      （{humanizeCondition(node.condition, fieldLabels)}）
                    </span>
                  )}
                  {node.condition && !fieldLabels && (
                    <span className={styles.conditionLabel}>
                      （条件节点）
                    </span>
                  )}
                </div>
              </div>
              {index < nodes.length - 1 && <div className={styles.nodeConnector} />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FormPreview;
