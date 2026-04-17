import React from 'react';
import { Card, Timeline, Avatar, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  SwapOutlined,
  TeamOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import type { ApprovalAction } from '@/types/oa-approval';
import { formatDateTime } from '@/utils/format';
import styles from '../index.less';

const { Text } = Typography;

/** 获取操作类型文本 */
function getActionText(actionType: string): string {
  const actionMap: Record<string, string> = {
    approve: '通过',
    reject: '驳回',
    transfer: '转交',
    countersign: '加签',
    withdraw: '撤回',
    submit: '提交',
  };
  return actionMap[actionType] || actionType;
}

interface ApprovalTimelineProps {
  actions: ApprovalAction[];
}

/** 审批时间线组件 */
const ApprovalTimeline: React.FC<ApprovalTimelineProps> = ({ actions }) => {
  return (
    <Card title="审批记录" className={styles.card}>
      <Timeline
        items={actions.map((action) => {
          let icon = <ClockCircleOutlined />;
          let color = 'blue';
          switch (action.actionType) {
            case 'approve':
              icon = <CheckCircleOutlined />;
              color = 'green';
              break;
            case 'reject':
              icon = <CloseCircleOutlined />;
              color = 'red';
              break;
            case 'transfer':
              icon = <SwapOutlined />;
              color = 'orange';
              break;
            case 'countersign':
              icon = <TeamOutlined />;
              color = 'purple';
              break;
            case 'withdraw':
              icon = <RollbackOutlined />;
              color = 'gray';
              break;
          }
          return {
            dot: <Avatar icon={icon} style={{ backgroundColor: color }} size="small" />,
            children: (
              <div className={styles.timelineItem}>
                <div className={styles.timelineHeader}>
                  <Text strong>{action.operatorName}</Text>
                  <Text type="secondary">{formatDateTime(action.actionAt)}</Text>
                </div>
                <div className={styles.timelineContent}>
                  <Tag>{getActionText(action.actionType)}</Tag>
                  {action.comment && <Text type="secondary">：{action.comment}</Text>}
                </div>
              </div>
            ),
          };
        })}
      />
    </Card>
  );
};

export default ApprovalTimeline;
