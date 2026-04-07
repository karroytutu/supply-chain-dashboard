/**
 * 流程状态面板
 * 横向展示4个流程节点：财务预处理 → 营销主管分配 → 催收中 → 待审核
 */
import React from 'react';
import { Badge, Space } from 'antd';
import {
  FileSearchOutlined,
  UserAddOutlined,
  PhoneOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import type { OverdueStatsResponse } from '@/types/accounts-receivable';
import styles from '../index.less';

interface FlowStatusPanelProps {
  flowStatus: OverdueStatsResponse['flowStatus'] | undefined;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

interface FlowNode {
  key: string;
  label: string;
  icon: React.ReactNode;
  count: number;
}

const FlowStatusPanel: React.FC<FlowStatusPanelProps> = ({
  flowStatus,
  activeTab,
  onTabChange,
}) => {
  const nodes: FlowNode[] = [
    {
      key: 'preprocessing',
      label: '财务预处理',
      icon: <FileSearchOutlined />,
      count: flowStatus?.preprocessingPending || 0,
    },
    {
      key: 'assignment',
      label: '营销主管分配',
      icon: <UserAddOutlined />,
      count: flowStatus?.assignmentPending || 0,
    },
    {
      key: 'collecting',
      label: '催收中',
      icon: <PhoneOutlined />,
      count: flowStatus?.collecting || 0,
    },
    {
      key: 'review',
      label: '待审核',
      icon: <CheckCircleOutlined />,
      count: flowStatus?.reviewPending || 0,
    },
  ];

  return (
    <div className={styles.flowStatusPanel}>
      <div className={styles.flowNodes}>
        {nodes.map((node, index) => (
          <React.Fragment key={node.key}>
            <div
              className={`${styles.flowNode} ${activeTab === node.key ? styles.active : ''}`}
              onClick={() => onTabChange(node.key)}
              role="button"
              tabIndex={0}
            >
              <div className={styles.nodeIcon}>{node.icon}</div>
              <div className={styles.nodeContent}>
                <span className={styles.nodeLabel}>{node.label}</span>
                <Badge
                  count={node.count}
                  showZero
                  className={styles.nodeBadge}
                  style={{
                    backgroundColor: node.count > 0 ? '#ff4d4f' : '#d9d9d9',
                  }}
                />
              </div>
            </div>
            {index < nodes.length - 1 && (
              <div className={styles.flowArrow}>→</div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default FlowStatusPanel;
