import React from 'react';
import { Steps, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SwapOutlined,
  MinusCircleOutlined,
  ClockCircleOutlined,
  SendOutlined,
} from '@ant-design/icons';
import UserAvatar from '@/components/UserAvatar';
import type { ApprovalNode, ApprovalStatus, CcUser } from '@/types/oa-approval';
import { formatDateTime } from '@/utils/format';
import styles from './ApprovalFlow.less';

const { Text } = Typography;

interface ApprovalFlowProps {
  nodes: ApprovalNode[];
  ccUsers?: CcUser[];
  currentStep: number;
  instanceStatus: ApprovalStatus;
}

/** 节点状态对应的中文标签 */
const NODE_STATUS_TEXT: Record<string, string> = {
  pending: '待审批',
  approved: '已通过',
  rejected: '已拒绝',
  transferred: '已转交',
  skipped: '已跳过',
  cancelled: '已取消',
};

/** 按 nodeOrder 分组（处理加签节点） */
function groupNodesByOrder(nodes: ApprovalNode[]): ApprovalNode[][] {
  const groups: Map<number, ApprovalNode[]> = new Map();
  for (const node of nodes) {
    const list = groups.get(node.nodeOrder) || [];
    list.push(node);
    groups.set(node.nodeOrder, list);
  }
  return Array.from(groups.values());
}

/** 渲染步骤图标 */
function renderStepIcon(status: string, isCurrent: boolean) {
  const iconStyle: React.CSSProperties = { fontSize: 14 };
  if (status === 'approved') return <CheckCircleOutlined style={{ ...iconStyle, color: '#52c41a' }} />;
  if (status === 'rejected') return <CloseCircleOutlined style={{ ...iconStyle, color: '#f5222d' }} />;
  if (status === 'transferred') return <SwapOutlined style={{ ...iconStyle, color: '#fa8c16' }} />;
  if (status === 'skipped' || status === 'cancelled') return <MinusCircleOutlined style={{ ...iconStyle, color: '#d9d9d9' }} />;
  if (isCurrent) return <ClockCircleOutlined style={{ ...iconStyle, color: '#1890ff' }} />;
  return <div className={styles.stepDot} />;
}

/** 渲染单组节点内的审批人列表 */
function renderApproverRow(node: ApprovalNode) {
  return (
    <div className={styles.stepApprover} key={node.id}>
      <UserAvatar
        className={styles.stepAvatar}
        size={32}
        src={node.assignedUserAvatar ?? undefined}
        name={node.assignedUserName ?? undefined}
      />
      <div className={styles.stepInfo}>
        <div className={styles.stepName}>
          {node.assignedUserName || '待分配'}
        </div>
        <div className={styles.stepMeta}>
          <Text type="secondary" className={styles.statusText}>
            {NODE_STATUS_TEXT[node.status] || node.status}
          </Text>
          {node.actedAt && (
            <Text type="secondary" className={styles.timeText}>
              {formatDateTime(node.actedAt)}
            </Text>
          )}
        </div>
        {node.comment && (
          <div className={styles.stepComment}>{node.comment}</div>
        )}
      </div>
    </div>
  );
}

/** 审批流程通用组件 */
const ApprovalFlow: React.FC<ApprovalFlowProps> = ({
  nodes,
  ccUsers,
  currentStep,
  instanceStatus,
}) => {
  const groupedNodes = groupNodesByOrder(nodes);
  const stepsStatus = instanceStatus === 'rejected' ? 'error' : 'process';

  return (
    <div className={styles.approvalFlow}>
      <Steps
        direction="vertical"
        current={currentStep}
        status={stepsStatus}
        className={styles.steps}
      >
        {groupedNodes.map((group, idx) => {
          const firstNode = group[0];
          const isCurrent = firstNode.status === 'pending';

          return (
            <Steps.Step
              key={firstNode.id}
              icon={renderStepIcon(firstNode.status, isCurrent)}
              title={
                <span className={styles.stepTitle}>
                  {firstNode.nodeName}
                  {firstNode.isCountersign && (
                    <Tag color="purple" className={styles.nodeTypeTag}>加签</Tag>
                  )}
                </span>
              }
              description={
                <div className={styles.stepDescription}>
                  {group.map(renderApproverRow)}
                </div>
              }
            />
          );
        })}
      </Steps>

      {ccUsers && ccUsers.length > 0 && (
        <div className={styles.ccSection}>
          <div className={styles.ccTitle}>
            <SendOutlined className={styles.ccIcon} />
            <span>抄送人</span>
            <Text type="secondary" className={styles.ccCount}>{ccUsers.length}人</Text>
          </div>
          <div className={styles.ccList}>
            {ccUsers.map(user => (
              <div className={styles.ccItem} key={user.id}>
                <UserAvatar size={24} src={user.avatar ?? undefined} name={user.userName ?? undefined} />
                <span className={styles.ccName}>{user.userName || '未知'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ApprovalFlow;
