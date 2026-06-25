import React, { useState, useEffect } from 'react';
import { Timeline, Image } from 'antd';
import { SendOutlined, SettingOutlined, ClockCircleOutlined, WarningOutlined, PaperClipOutlined, DownloadOutlined } from '@ant-design/icons';
import UserAvatar from '@/components/UserAvatar';
import type { ApprovalNode, ApprovalAction, AttachmentMeta, CcUser, ApprovalStatus, ErpMeta } from '@/types/oa';
import { formatDateTime } from '@/utils/format';
import { NODE_TYPE_CONFIG, getTimelineColor, NodeHeader } from './flow-types';
import TimelineApprovalGroup from './TimelineApprovalGroup';
import TimelineCcNode from './TimelineCcNode';
import styles from './ApprovalFlow.less';

/** 按 (nodeOrder, round) 复合键分组（退回后同一环节的不同轮次作为独立条目展示） */
function groupNodesByOrder(nodes: ApprovalNode[]): ApprovalNode[][] {
  const groups: Map<string, ApprovalNode[]> = new Map();
  for (const node of nodes) {
    const key = `${node.nodeOrder}-${node.round ?? 1}`;
    const list = groups.get(key) || [];
    list.push(node);
    groups.set(key, list);
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

/** 渲染节点类型图标（无用户时回退使用） */
function renderNodeIcon(nodeType: string) {
  const config = NODE_TYPE_CONFIG[nodeType] || NODE_TYPE_CONFIG.approval;
  return (
    <div className={styles.timelineSystemIcon} style={{ background: `${config.color}15`, borderRadius: '50%' }}>
      <span style={{ color: config.color, fontSize: 16 }}>{config.icon}</span>
    </div>
  );
}

/** 获取审批节点组的代表性头像/图标（无对勾叠加） */
function getApprovalGroupIcon(nodes: ApprovalNode[]): React.ReactNode {
  const firstNode = nodes[0];

  if (firstNode.nodeType === 'auto') {
    return (
      <div className={styles.timelineSystemIcon}>
        <SettingOutlined style={{ fontSize: 16, color: '#722ed1' }} />
      </div>
    );
  }

  if (firstNode.nodeType === 'cc') {
    return (
      <div className={styles.timelineSystemIcon}>
        <SendOutlined style={{ fontSize: 16, color: '#1890ff' }} />
      </div>
    );
  }

  // 有分配用户时显示第一个用户的头像
  if (firstNode.assignedUserIds && firstNode.assignedUserIds.length > 0) {
    return (
      <UserAvatar
        size={32}
        src={firstNode.assignedUserAvatar ?? undefined}
        name={firstNode.assignedUserNames?.[0] ?? undefined}
        style={firstNode.assignedUserAvatar ? undefined : { backgroundColor: '#1890ff', color: '#fff' }}
      />
    );
  }

  // 无分配用户时回退到类型图标
  return renderNodeIcon(firstNode.nodeType);
}

/** 获取审批节点组的标题时间 */
function getApprovalGroupTime(nodes: ApprovalNode[]): string | null {
  const actedNode = nodes.find((n) => n.actedAt);
  if (actedNode?.actedAt) return formatDateTime(actedNode.actedAt);
  return null;
}

/** 获取审批节点组的状态文字和颜色 */
function getApprovalGroupStatus(nodes: ApprovalNode[]): { status: string; statusColor: string } | null {
  const firstNode = nodes[0];
  if (firstNode.nodeType === 'cc') {
    if (firstNode.status === 'approved') return { status: '已抄送', statusColor: '#52c41a' };
    if (firstNode.status === 'pending') return { status: '待抄送', statusColor: '#fa8c16' };
  }
  const statusMap: Record<string, { text: string; color: string }> = {
    approved: { text: '已同意', color: '#52c41a' },
    rejected: { text: '已拒绝', color: '#f5222d' },
    transferred: { text: '已转交', color: '#fa8c16' },
    pending: { text: '待处理', color: '#fa8c16' },
    processing: { text: '处理中', color: '#1890ff' },
    cancelled: { text: '已取消', color: '#999' },
    failed: { text: '执行失败', color: '#f5222d' },
    send_back: { text: '已退回', color: '#fa8c16' },
  };
  const config = statusMap[firstNode.status];
  if (!config) return null;
  return { status: config.text, statusColor: config.color };
}

/** 获取审批节点组的审批人姓名（subtitle）
 *  单人：显示姓名
 *  多人：显示“姓名1、姓名2”
 */
function getApprovalGroupSubtitle(nodes: ApprovalNode[]): string | undefined {
  const firstNode = nodes[0];
  if (firstNode.nodeType === 'auto') return undefined;
  if (firstNode.nodeType === 'cc') return `抄送 ${nodes.length} 人`;
  if (firstNode.assignedUserNames && firstNode.assignedUserNames.length > 0) {
    return firstNode.assignedUserNames.join('、');
  }
  return undefined;
}

/** 从非评论操作中提取审批意见（第一个有 comment 的操作） */
const APPROVAL_ACTION_TYPES = ['approve', 'reject', 'transfer', 'send_back', 'countersign', 'update'];
function getApprovalComment(actions: ApprovalAction[]): string | null {
  const approvalAction = actions.find(
    a => APPROVAL_ACTION_TYPES.includes(a.actionType) && a.comment
  );
  return approvalAction?.comment || null;
}

/** 从操作记录中提取附件 */
function getActionAttachments(action: ApprovalAction | undefined): AttachmentMeta[] {
  return action?.attachments || [];
}

/** 格式化文件大小 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** 渲染附件列表（图片缩略图 + 文件下载） */
function ActionAttachments({ attachments }: { attachments: AttachmentMeta[] }) {
  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter(a => a.isImage);
  const files = attachments.filter(a => !a.isImage);

  return (
    <div style={{ marginTop: 8 }}>
      {/* 图片缩略图 */}
      {images.length > 0 && (
        <Image.PreviewGroup>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {images.map(img => (
              <Image
                key={img.url}
                src={img.url}
                width={60}
                height={60}
                style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #f0f0f0' }}
                alt={img.name}
              />
            ))}
          </div>
        </Image.PreviewGroup>
      )}
      {/* 文件列表 */}
      {files.length > 0 && (
        <div style={{ marginTop: images.length > 0 ? 8 : 0 }}>
          {files.map(file => (
            <div
              key={file.url}
              style={{
                display: 'flex', alignItems: 'center', padding: '4px 0',
                fontSize: 12, color: '#8c8c8c',
              }}
            >
              <PaperClipOutlined style={{ marginRight: 4 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                {file.name}
              </span>
              <span style={{ marginLeft: 4 }}>({formatFileSize(file.size)})</span>
              <a href={file.url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 6, color: '#1890ff' }}>
                <DownloadOutlined />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
        {isOverdue ? <WarningOutlined /> : <ClockCircleOutlined />}
        <span>{isOverdue ? '已超时' : '剩余'} {durationText}</span>
        {node.reminderCount > 0 && (
          <span style={{ marginLeft: 8, color: '#8c8c8c' }}>已催办 {node.reminderCount} 次</span>
        )}
        {node.ccSupervisorAt && (
          <span style={{ marginLeft: 4, color: '#fa541c' }}>已抄送上级</span>
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
  applicantName,
  applicantAvatar,
  submittedAt,
}) => {
  const groupedNodes = groupNodesByOrder(nodes);
  const actionsByNodeOrder = groupActionsByNodeOrder(actions);

  // 提取 nodeOrder 为 null 的评论（历史数据标注）
  const startNodeComments = actions.filter(
    a => a.actionType === 'comment' && a.nodeOrder == null
  );

  // 构造时间线条目数组
  const items: React.ReactNode[] = [];

  // 1. 发起申请节点 — 姓名统一在标题行
  items.push(
    <Timeline.Item
      key="start"
      dot={
        <UserAvatar
          size={36}
          src={applicantAvatar ?? undefined}
          name={applicantName}
          style={applicantAvatar ? undefined : { backgroundColor: '#1890ff', color: '#fff' }}
        />
      }
      color="green"
    >
      <NodeHeader title="发起申请" subtitle={applicantName} time={submittedAt ? formatDateTime(submittedAt) : null} />
    </Timeline.Item>
  );

  // 1.5 起始节点评论
  startNodeComments.forEach((action) => {
    items.push(
      <Timeline.Item
        key={`start-comment-${action.id}`}
        dot={
          <UserAvatar
            size={32}
            name={action.operatorName || '未知'}
            style={{ backgroundColor: '#1890ff', color: '#fff' }}
          />
        }
        color="blue"
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
          {/* 评论附件 */}
          <ActionAttachments attachments={action.attachments || []} />
        </div>
      </Timeline.Item>
    );
  });

  // 2. 审批节点组
  groupedNodes.forEach((group) => {
    const firstNode = group[0];
    const nodeActions = actionsByNodeOrder.get(firstNode.nodeOrder) || [];
    const groupStatus = getApprovalGroupStatus(group);
    const subtitle = getApprovalGroupSubtitle(group);
    // 退回后重新走同一环节时，在标题中标注轮次
    const roundLabel = (firstNode.round && firstNode.round > 1)
      ? `${firstNode.nodeName}（第${firstNode.round}轮）`
      : firstNode.nodeName;

    // 分离 comment 和非 comment 操作
    const commentActions = nodeActions.filter(a => a.actionType === 'comment');
    const otherActions = nodeActions.filter(a => a.actionType !== 'comment');

    // 提取审批意见（非斜体，普通灰色文本）
    const approvalComment = getApprovalComment(otherActions);
    // 提取审批动作的附件
    const approvalAction = otherActions.find(
      a => APPROVAL_ACTION_TYPES.includes(a.actionType) && a.attachments?.length > 0
    );
    const approvalAttachments = getActionAttachments(approvalAction);

    // auto 节点内容区保持干净（不渲染 ErpStep），其他节点保留操作记录
    const showApprovalGroup = firstNode.nodeType !== 'auto' && otherActions.length > 0;

    items.push(
      <Timeline.Item
        key={`approval-${firstNode.nodeOrder}-${firstNode.round ?? 1}`}
        dot={getApprovalGroupIcon(group)}
        color={getTimelineColor(firstNode.status)}
      >
        <NodeHeader
          title={roundLabel}
          subtitle={subtitle}
          status={groupStatus?.status}
          statusColor={groupStatus?.statusColor}
          time={getApprovalGroupTime(group)}
        />
        {/* 审批意见（普通灰色文本，不用斜体） */}
        {approvalComment && (
          <div className={styles.approvalComment}>{approvalComment}</div>
        )}
        {/* 审批附言附件 */}
        <ActionAttachments attachments={approvalAttachments} />
        {/* 非 auto 节点的操作记录（转交、加签等非冗余操作） */}
        {showApprovalGroup && (
          <TimelineApprovalGroup nodes={group} actions={otherActions} />
        )}
        {/* 时限状态（仅 pending 且有 deadlineAt） */}
        {firstNode.status === 'pending' && firstNode.deadlineAt && (
          <TimeoutStatusBadge node={firstNode} />
        )}
      </Timeline.Item>
    );

    // 独立评论条目（32px 头像 + 无灰底）
    commentActions.forEach(action => {
      items.push(
        <Timeline.Item
          key={`comment-${action.id}`}
          dot={
            <UserAvatar
              size={32}
              name={action.operatorName || '未知'}
              style={{ backgroundColor: '#1890ff', color: '#fff' }}
            />
          }
          color="blue"
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
            {/* 评论附件 */}
            <ActionAttachments attachments={action.attachments || []} />
          </div>
        </Timeline.Item>
      );
    });
  });

  // 3. 抄送节点（仅当 groupedNodes 中无 CC 类型节点时才渲染，避免重复显示）
  const hasCcNode = nodes.some(n => n.nodeType === 'cc');
  if (ccUsers && ccUsers.length > 0 && !hasCcNode) {
    items.push(
      <Timeline.Item
        key="cc"
        dot={
          <div className={styles.timelineSystemIcon}>
            <SendOutlined style={{ fontSize: 16, color: '#1890ff' }} />
          </div>
        }
        color="blue"
      >
        <NodeHeader title="抄送" />
        <TimelineCcNode ccUsers={ccUsers} />
      </Timeline.Item>
    );
  }

  return (
    <Timeline className={styles.approvalTimeline}>
      {items}
    </Timeline>
  );
};

export default ApprovalFlowActual;
