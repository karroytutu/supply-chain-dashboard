import React from 'react';
import { SendOutlined, SettingOutlined, CheckCircleFilled } from '@ant-design/icons';
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

  // 提取 submit 动作，显示在“发起申请”起始节点下
  const submitActions = actions.filter(a => a.actionType === 'submit');

  // 构造时间线条目数组
  const entries: React.ReactNode[] = [];

  // 1. 发起申请节点（始终视为已完成，显示对勾）
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
      isLast={groupedNodes.length === 0 && (!ccUsers || ccUsers.length === 0)}
    >
      <TimelineStartNode applicantName={applicantName} />
      {submitActions.length > 0 && (
        <div className={styles.timelineActionList}>
          {submitActions.map(action => <ActionEntry key={action.id} action={action} />)}
        </div>
      )}
    </TimelineItem>
  );

  // 2. 审批节点组
  groupedNodes.forEach((group, index) => {
    const firstNode = group[0];
    const nodeActions = actionsByNodeOrder.get(firstNode.nodeOrder) || [];
    const isLast = index === groupedNodes.length - 1 && (!ccUsers || ccUsers.length === 0);

    entries.push(
      <TimelineItem
        key={`approval-${firstNode.nodeOrder}`}
        icon={getApprovalGroupIcon(group)}
        title={firstNode.nodeName}
        time={getApprovalGroupTime(group)}
        isLast={isLast}
      >
        <TimelineApprovalGroup
          nodes={group}
          actions={nodeActions}
          erpMeta={firstNode.nodeType === 'auto' ? erpMeta : undefined}
          instanceId={instanceId}
        />
      </TimelineItem>
    );
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
