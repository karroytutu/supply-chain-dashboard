import React, { useState, useEffect } from 'react';
import { SendOutlined, SettingOutlined, CheckCircleFilled, ClockCircleOutlined, WarningOutlined } from '@ant-design/icons';
import UserAvatar from '@/components/UserAvatar';
import type { ApprovalNode, ApprovalAction, CcUser, ApprovalStatus, ErpMeta } from '@/types/oa';
import { formatDateTime } from '@/utils/format';
import { NODE_TYPE_CONFIG } from './flow-types';
import TimelineItem from './TimelineItem';
import TimelineStartNode, { StartNodeIcon } from './TimelineStartNode';
import TimelineApprovalGroup, { ActionEntry } from './TimelineApprovalGroup';
import TimelineCcNode from './TimelineCcNode';
import styles from './ApprovalFlow.less';

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

/** 将 actions 按 nodeOrder 分组 */
function groupActionsByNodeOrder(actions: ApprovalAction[]): Map<number, ApprovalAction[]> {
  const map = new Map<number, ApprovalAction[]>();
  for (const action of actions) {
    if (action.nodeOrder == null) continue;
    const list = map.get(action.nodeOrder) || [];
    list.push(action);
    map.set(action.nodeOrder, list);
  }
  return map;
}

/** 在图标右下角叠加绿色对勾 */
function IconWithCheck({ icon, showCheck }: { icon: React.ReactNode; showCheck: boolean }) {
  if (!showCheck) return <>{icon}</>;
  return (
    <div className={styles.timelineAvatarWrap}>
      {icon}
      <CheckCircleFilled className={styles.timelineCheck} />
    </div>
  );
}

/** 渲染实际节点类型图标 */
function renderNodeIcon(nodeType: string) {
  const config = NODE_TYPE_CONFIG[nodeType] || NODE_TYPE_CONFIG.role;
  return (
    <div className={styles.timelineSystemIcon} style={{ background: `${config.color}15`, borderRadius: '50%' }}>
      <span style={{ color: config.color, fontSize: 16 }}>{config.icon}</span>
    </div>
  );
}

/** 获取审批节点组的代表性图标 */
function getApprovalGroupIcon(nodes: ApprovalNode[]): React.ReactNode {
  const firstNode = nodes[0];
  const isApproved = firstNode.status === 'approved';

  if (firstNode.nodeType === 'auto') {
    return (
      <IconWithCheck
        showCheck={isApproved}
        icon={
          <div className={styles.timelineSystemIcon}>
            <SettingOutlined style={{ fontSize: 16, color: '#722ed1' }} />
          </div>
        }
      />
    );
  }

  // 有分配用户时显示用户头像
  if (firstNode.assignedUserId) {
    return (
      <IconWithCheck
        showCheck={isApproved}
        icon={
          <UserAvatar
            size={32}
            src={firstNode.assignedUserAvatar ?? undefined}
            name={firstNode.assignedUserName ?? undefined}
            style={firstNode.assignedUserAvatar ? undefined : { backgroundColor: '#1890ff', color: '#fff' }}
          />
        }
      />
    );
  }

  // 无分配用户时回退到类型图标
  return (
    <IconWithCheck
      showCheck={isApproved}
      icon={renderNodeIcon(firstNode.nodeType)}
    />
  );
}

/** 获取审批节点组的标题时间 */
function getApprovalGroupTime(nodes: ApprovalNode[]): string | null {
  // 优先取第一个已处理节点的时间
  const actedNode = nodes.find((n) => n.actedAt);
  if (actedNode?.actedAt) return formatDateTime(actedNode.actedAt);
  return null;
}

/** 获取审批节点组的状态文字和颜色（用于 TimelineItem 标题行） */
function getApprovalGroupStatus(nodes: ApprovalNode[]): { status: string; statusColor: string } | null {
  const firstNode = nodes[0];
  const statusMap: Record<string, { text: string; color: string }> = {
    approved: { text: '已同意', color: '#52c41a' },
    rejected: { text: '已拒绝', color: '#f5222d' },
    transferred: { text: '已转交', color: '#fa8c16' },
    pending: { text: '待处理', color: '#fa8c16' },
    processing: { text: '处理中', color: '#1890ff' },
    skipped: { text: '已跳过', color: '#999' },
    cancelled: { text: '已取消', color: '#999' },
    failed: { text: '执行失败', color: '#f5222d' },
  };
  const config = statusMap[firstNode.status];
  if (!config) return null;
  return { status: config.text, statusColor: config.color };
}

/** 获取审批节点组的审批人姓名（用于 TimelineItem 标题行） */
function getApprovalGroupSubtitle(nodes: ApprovalNode[]): string | undefined {
  const firstNode = nodes[0];
  if (firstNode.nodeType === 'auto') return undefined;
  return firstNode.assignedUserName || undefined;
}

/** 时限状态徽章组件 */
function TimeoutStatusBadge({ node }: { node: ApprovalNode }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  if (!node.deadlineAt) return null;

  const now = Date.now();
  const deadline = new Date(node.deadlineAt).getTime();
  const diff = deadline - now;
  const isOverdue = diff <= 0;

  const absMs = Math.abs(diff);
  const totalMin = Math.floor(absMs / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  const durationText = days > 0 ? `${days}天${hours}小时` : hours > 0 ? `${hours}小时${minutes}分` : `${minutes}分钟`;

  return (
    <div style={{
      marginTop: 8,
      padding: '6px 10px',
      borderRadius: 6,
      backgroundColor: isOverdue ? '#fff2f0' : '#f6ffed',
      border: `1px solid ${isOverdue ? '#ffccc7' : '#b7eb8f'}`,
      fontSize: 12,
      color: isOverdue ? '#cf1322' : '#389e0d',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {isOverdue
          ? <WarningOutlined />
          : <ClockCircleOutlined />
        }
        <span>
          {isOverdue ? '已超时' : '剩余'} {durationText}
        </span>
        {node.reminderCount > 0 && (
          <span style={{ marginLeft: 8, color: '#8c8c8c' }}>
            🔔 已催办 {node.reminderCount} 次
          </span>
        )}
        {node.ccSupervisorAt && (
          <span style={{ marginLeft: 4, color: '#fa541c' }}>
            📋 已抄送上级
          </span>
        )}
      </div>
      <div style={{ marginTop: 2, color: '#8c8c8c' }}>
        截止: {formatDateTime(node.deadlineAt)}
      </div>
    </div>
  );
}

export interface ApprovalFlowActualProps {
  nodes: ApprovalNode[];
  ccUsers?: CcUser[];
  currentStep: number;
  instanceStatus: ApprovalStatus;
  actions?: ApprovalAction[];
  erpMeta?: ErpMeta | null;
  instanceId?: number;
  applicantName?: string;
  applicantAvatar?: string | null;
  submittedAt?: string;
}

const ApprovalFlowActual: React.FC<ApprovalFlowActualProps> = ({
  nodes,
  ccUsers,
  actions = [],
  erpMeta,
  instanceId,
  applicantName,
  applicantAvatar,
  submittedAt,
}) => {
  const groupedNodes = groupNodesByOrder(nodes);
  const actionsByNodeOrder = groupActionsByNodeOrder(actions);

  // 提取 submit 动作，显示在"发起申请"起始节点下
  const submitActions = actions.filter(a => a.actionType === 'submit');
  
  // 提取 nodeOrder 为 null 的评论，显示在"发起申请"起始节点之后
  const startNodeComments = actions.filter(
    a => a.actionType === 'comment' && a.nodeOrder == null
  );
  
  // 构造时间线条目数组
  const entries: React.ReactNode[] = [];
  
  // 1. 发起申请节点（始终视为已完成，显示对勾）
  const hasNodesAfterStart = groupedNodes.length > 0 || (ccUsers && ccUsers.length > 0);
  entries.push(
    <TimelineItem
      key="start"
      isFirst
      icon={
        <IconWithCheck
          showCheck
          icon={<StartNodeIcon applicantName={applicantName} applicantAvatar={applicantAvatar} />}
        />
      }
      title="发起申请"
      time={submittedAt ? formatDateTime(submittedAt) : null}
      isLast={!hasNodesAfterStart && startNodeComments.length === 0}
    >
      <TimelineStartNode applicantName={applicantName} />
      {submitActions.length > 0 && (
        <div className={styles.timelineActionList}>
          {submitActions.map(action => <ActionEntry key={action.id} action={action} />)}
        </div>
      )}
    </TimelineItem>
  );
  
  // 1.5 起始节点评论（nodeOrder 为 null 的 comment，如历史数据标注）
  startNodeComments.forEach((action, index) => {
    const isLastComment = index === startNodeComments.length - 1;
    entries.push(
      <TimelineItem
        key={`start-comment-${action.id}`}
        icon={<div className={styles.timelineCommentDot} />}
        title=""
        isLast={!hasNodesAfterStart && isLastComment}
      >
        <div className={styles.timelineCommentEntry}>
          <div className={styles.timelineCommentHeader}>
            <span className={styles.timelineCommentAuthor}>{action.operatorName || '未知'}</span>
            <span className={styles.timelineCommentLabel}>添加了评论</span>
            {action.actionAt && (
              <span className={styles.timelineCommentTime}>{formatDateTime(action.actionAt)}</span>
            )}
          </div>
          <div className={styles.timelineCommentContent}>{action.comment}</div>
        </div>
      </TimelineItem>
    );
  });

  // 2. 审批节点组
  groupedNodes.forEach((group, index) => {
    const firstNode = group[0];
    const nodeActions = actionsByNodeOrder.get(firstNode.nodeOrder) || [];
    const isLast = index === groupedNodes.length - 1 && (!ccUsers || ccUsers.length === 0);
    const groupStatus = getApprovalGroupStatus(group);
    const subtitle = getApprovalGroupSubtitle(group);

    // 分离 comment 类型和非 comment 类型的 action
    const commentActions = nodeActions.filter(a => a.actionType === 'comment');
    const otherActions = nodeActions.filter(a => a.actionType !== 'comment');

    entries.push(
      <TimelineItem
        key={`approval-${firstNode.nodeOrder}`}
        icon={getApprovalGroupIcon(group)}
        title={firstNode.nodeName}
        subtitle={subtitle}
        status={groupStatus?.status}
        statusColor={groupStatus?.statusColor}
        time={getApprovalGroupTime(group)}
        isLast={isLast && commentActions.length === 0}
      >
        <TimelineApprovalGroup
          nodes={group}
          actions={otherActions}
          erpMeta={firstNode.nodeType === 'auto' ? erpMeta : undefined}
          instanceId={instanceId}
        />
        {/* 时限状态展示（仅 pending 且有 deadlineAt 的节点） */}
        {firstNode.status === 'pending' && firstNode.deadlineAt && (
          <TimeoutStatusBadge node={firstNode} />
        )}
      </TimelineItem>
    );

    // comment 类型的 action 作为独立条目渲染在节点之后
    commentActions.forEach(action => {
      entries.push(
        <TimelineItem
          key={`comment-${action.id}`}
          icon={
            <div className={styles.timelineCommentDot} />
          }
          title=""
          isLast={isLast && commentActions.indexOf(action) === commentActions.length - 1}
        >
          <div className={styles.timelineCommentEntry}>
            <div className={styles.timelineCommentHeader}>
              <span className={styles.timelineCommentAuthor}>{action.operatorName || '未知'}</span>
              <span className={styles.timelineCommentLabel}>添加了评论</span>
              {action.actionAt && (
                <span className={styles.timelineCommentTime}>{formatDateTime(action.actionAt)}</span>
              )}
            </div>
            <div className={styles.timelineCommentContent}>{action.comment}</div>
          </div>
        </TimelineItem>
      );
    });
  });

  // 3. 抄送节点
  if (ccUsers && ccUsers.length > 0) {
    entries.push(
      <TimelineItem
        key="cc"
        icon={
          <div className={styles.timelineSystemIcon}>
            <SendOutlined style={{ fontSize: 16, color: '#1890ff' }} />
          </div>
        }
        title="抄送"
        isLast
      >
        <TimelineCcNode ccUsers={ccUsers} />
      </TimelineItem>
    );
  }

  return <div className={styles.timeline}>{entries}</div>;
};

export default ApprovalFlowActual;
