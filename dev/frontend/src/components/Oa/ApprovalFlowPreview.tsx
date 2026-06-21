import React from 'react';
import { Timeline, Spin, Tooltip, Tag } from 'antd';
import { UserOutlined, ClockCircleOutlined } from '@ant-design/icons';
import UserAvatar from '@/components/UserAvatar';
import { usePermission } from '@/hooks/usePermission';
import type { WorkflowNodeDef } from '@/types/oa';
import { NODE_TYPE_CONFIG, NodeHeader } from './flow-types';
import { useWorkflowPreview } from './hooks/useWorkflowPreview';
import styles from './ApprovalFlow.less';

export interface ApprovalFlowPreviewProps {
  /** 流程定义节点列表（作为后端返回为空时的兜底展示） */
  workflowNodes: WorkflowNodeDef[];
  /** 表单类型编码，用于动态流程预览 */
  formTypeCode?: string;
  /** 字段 key → 标签映射（保留接口兼容，不再用于条件描述展示） */
  fieldLabels?: Record<string, string>;
  /** 当前表单数据，用于动态流程预览 */
  formData?: Record<string, unknown>;
}

/** 渲染预览节点图标 */
function renderNodeIcon(nodeType: string) {
  const config = NODE_TYPE_CONFIG[nodeType] || NODE_TYPE_CONFIG.approval;
  return (
    <div className={styles.timelineSystemIcon} style={{ background: `${config.color}15`, borderRadius: '50%' }}>
      <span style={{ color: config.color, fontSize: 16 }}>{config.icon}</span>
    </div>
  );
}

const ApprovalFlowPreview: React.FC<ApprovalFlowPreviewProps> = ({
  workflowNodes,
  formTypeCode,
  formData,
}) => {
  const { currentUser } = usePermission();
  const { visibleNodes, approvers, loading: loadingPreview } = useWorkflowPreview(formTypeCode, formData);

  // 后端返回为空时兜底使用静态节点定义
  const displayNodes = visibleNodes.length > 0 ? visibleNodes : workflowNodes;

  /** 根据 nodeOrder 查找预解析的审批人 */
  const getApprover = (nodeOrder: number) => {
    return approvers.find(a => a.nodeOrder === nodeOrder);
  };

  const items: React.ReactNode[] = [];

  // 1. 发起申请节点 — 姓名在标题行
  const startIcon = currentUser ? (
    <UserAvatar
      size={32}
      src={currentUser.avatar || undefined}
      name={currentUser.name}
    />
  ) : (
    <div className={styles.timelineSystemIcon} style={{ background: '#1890ff15', borderRadius: '50%' }}>
      <UserOutlined style={{ fontSize: 16, color: '#1890ff' }} />
    </div>
  );

  const startSubtitle = currentUser
    ? currentUser.name + (currentUser.departmentName ? ` · ${currentUser.departmentName}` : '')
    : undefined;

  items.push(
    <Timeline.Item
      key="start"
      dot={startIcon}
      color="blue"
    >
      <NodeHeader
        title="发起申请"
        subtitle={startSubtitle}
      />
      {!currentUser && (
        <div className={styles.timelineMeta}>
          <span className={styles.timelineDept}>提交审批后进入流程</span>
        </div>
      )}
    </Timeline.Item>
  );

  // 2. 审批节点
  displayNodes.forEach((node) => {
    const approver = getApprover(node.order);

    const nodeIcon = (approver?.approverId && node.type !== 'auto')
      ? (
        <UserAvatar
          size={32}
          src={approver.approverAvatar ?? undefined}
          name={approver.approverName ?? undefined}
          style={approver.approverAvatar ? undefined : { backgroundColor: '#1890ff', color: '#fff' }}
        />
      )
      : renderNodeIcon(node.type);

    const subtitle = (approver && node.type !== 'auto')
      ? (approver.approverName || '待分配')
      : node.type === 'auto' ? '系统自动执行' : undefined;

    items.push(
      <Timeline.Item
        key={`node-${node.order}`}
        dot={nodeIcon}
        color="blue"
      >
        <NodeHeader title={node.name} subtitle={subtitle} />
        {/* 时限配置标签 */}
        {node.timeout && (
          <Tooltip
            title={
              <div style={{ fontSize: 12 }}>
                <div>处理时限: {node.timeout.durationMinutes >= 1440
                  ? `${Math.floor(node.timeout.durationMinutes / 1440)}天`
                  : `${Math.floor(node.timeout.durationMinutes / 60)}小时`}
                </div>
                {node.timeout.reminder && (
                  <div>
                    催办: {node.timeout.reminder.firstReminderDelayMinutes === 0 ? '超时即催办' : `超时${node.timeout.reminder.firstReminderDelayMinutes}分钟后`}
                    {node.timeout.reminder.intervalMinutes ? `，每${node.timeout.reminder.intervalMinutes >= 60 ? `${node.timeout.reminder.intervalMinutes / 60}小时` : `${node.timeout.reminder.intervalMinutes}分钟`}` : ''}
                    {node.timeout.reminder.ccSupervisorAfterCount ? `，催办${node.timeout.reminder.ccSupervisorAfterCount}次后抄送上级` : ''}
                  </div>
                )}
                {node.timeout.assessment && node.timeout.assessment.tiers.length > 0 && (
                  <div>
                    考核: 阶梯固定金额
                    {node.timeout.assessment.tiers.map((t, i) => (
                      <div key={i} style={{ paddingLeft: 8 }}>
                        {t.name}: ¥{t.penaltyAmount}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            }
          >
            <Tag
              icon={<ClockCircleOutlined />}
              color="blue"
              style={{ marginTop: 4, cursor: 'pointer' }}
            >
              时限: {node.timeout.durationMinutes >= 1440
                ? `${Math.floor(node.timeout.durationMinutes / 1440)}天`
                : `${Math.floor(node.timeout.durationMinutes / 60)}小时`}
            </Tag>
          </Tooltip>
        )}
      </Timeline.Item>
    );
  });

  return (
    <div>
      <div className={styles.previewHeader}>
        <span className={styles.previewTitle}>流程预览</span>
        {loadingPreview && <Spin size="small" />}
      </div>
      <Timeline className={styles.approvalTimeline}>
        {items}
      </Timeline>
    </div>
  );
};

export default ApprovalFlowPreview;
