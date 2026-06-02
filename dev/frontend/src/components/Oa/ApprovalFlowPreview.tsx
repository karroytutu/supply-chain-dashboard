import React from 'react';
import { Spin } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import UserAvatar from '@/components/UserAvatar';
import { usePermission } from '@/hooks/usePermission';
import type { WorkflowNodeDef } from '@/types/oa';
import { NODE_TYPE_CONFIG } from './flow-types';
import { useWorkflowPreview } from './hooks/useWorkflowPreview';
import TimelineItem from './TimelineItem';
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
  const { currentUser } = usePermission();
  const { visibleNodes, approvers, loading: loadingPreview } = useWorkflowPreview(formTypeCode, formData);

  // 后端返回为空时（如首次加载或请求失败），兜底使用静态节点定义
  const displayNodes = visibleNodes.length > 0 ? visibleNodes : workflowNodes;

  /** 根据 nodeOrder 查找预解析的审批人 */
  const getApprover = (nodeOrder: number) => {
    return approvers.find(a => a.nodeOrder === nodeOrder);
  };

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
      isLast={displayNodes.length === 0}
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
  displayNodes.forEach((node, index) => {
    const approver = getApprover(node.order);
    const isLast = index === displayNodes.length - 1;

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
        {loadingPreview && <Spin size="small" />}
      </div>
      <div className={styles.timeline}>{entries}</div>
    </div>
  );
};

export default ApprovalFlowPreview;
