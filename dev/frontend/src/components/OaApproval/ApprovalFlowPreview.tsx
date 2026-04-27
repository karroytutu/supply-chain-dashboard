import React, { useMemo } from 'react';
import { Spin } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import UserAvatar from '@/components/UserAvatar';
import { usePermission } from '@/hooks/usePermission';
import type { WorkflowNodeDef } from '@/types/oa-approval';
import { checkCondition } from '@/pages/OaApproval/Form/components/ConditionalFieldWrapper';
import { NODE_TYPE_CONFIG } from './flow-types';
import { usePreviewApprovers } from './hooks/usePreviewApprovers';
import TimelineItem from './TimelineItem';
import styles from './ApprovalFlow.less';

export interface ApprovalFlowPreviewProps {
  /** 流程定义节点列表 */
  workflowNodes: WorkflowNodeDef[];
  /** 表单类型编码，用于预解析审批人 */
  formTypeCode?: string;
  /** 字段 key → 标签映射（保留接口兼容，不再用于条件描述展示） */
  fieldLabels?: Record<string, string>;
  /** 当前表单数据，用于条件节点过滤 */
  formData?: Record<string, unknown>;
}

/** 渲染预览节点图标 */
function renderNodeIcon(nodeType: string) {
  const config = NODE_TYPE_CONFIG[nodeType] || NODE_TYPE_CONFIG.role;
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
  const { currentUser, roles } = usePermission();
  const { approvers, loading: loadingApprovers } = usePreviewApprovers(formTypeCode);

  /** 根据 nodeOrder 查找预解析的审批人 */
  const getApprover = (nodeOrder: number) => {
    return approvers.find(a => a.nodeOrder === nodeOrder);
  };

  /** 根据条件过滤可见节点 */
  const visibleNodes = useMemo(() => {
    if (!formData) return workflowNodes;

    const currentUserRole = roles[0] || '';
    const evalContext = { ...formData, _submitterRole: currentUserRole };

    return workflowNodes.filter((node) => {
      if (!node.condition) return true;
      return checkCondition(node.condition, evalContext);
    });
  }, [workflowNodes, formData, roles]);

  const entries: React.ReactNode[] = [];

  // 1. 发起申请节点
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

  entries.push(
    <TimelineItem
      key="start"
      isFirst
      icon={startIcon}
      title="发起申请"
      isLast={visibleNodes.length === 0}
    >
      <div className={styles.timelineMeta}>
        {currentUser ? (
          <>
            <span className={styles.timelineOperator}>{currentUser.name}</span>
            {currentUser.departmentName && (
              <span className={styles.timelineDept}>{currentUser.departmentName}</span>
            )}
          </>
        ) : (
          <span className={styles.timelineDept}>提交审批后进入流程</span>
        )}
      </div>
    </TimelineItem>
  );

  // 2. 审批节点（有预解析审批人时显示头像，否则显示类型图标）
  visibleNodes.forEach((node, index) => {
    const approver = getApprover(node.order);
    const isLast = index === visibleNodes.length - 1;

    // 有审批人时显示头像，否则使用类型图标
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

    entries.push(
      <TimelineItem
        key={`node-${node.order}`}
        icon={nodeIcon}
        title={node.name}
        isLast={isLast}
      >
        <div className={styles.timelineApprovalGroup}>
          <div className={styles.timelineApprovalNode}>
            <div className={styles.timelineApprovalBody}>
              {approver && node.type !== 'auto' && (
                <span className={styles.timelineApprovalOperator}>
                  {approver.approverName || '待分配'}
                </span>
              )}
              {node.type === 'auto' && (
                <span className={styles.timelineApprovalStatus}>
                  系统自动执行
                </span>
              )}
            </div>
          </div>
        </div>
      </TimelineItem>
    );
  });

  return (
    <div>
      <div className={styles.previewHeader}>
        <span className={styles.previewTitle}>流程预览</span>
        {loadingApprovers && <Spin size="small" />}
      </div>
      <div className={styles.timeline}>{entries}</div>
    </div>
  );
};

export default ApprovalFlowPreview;
