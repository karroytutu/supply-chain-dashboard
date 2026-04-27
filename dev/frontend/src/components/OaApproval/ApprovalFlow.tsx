import React, { useState } from 'react';
import { Steps, Tag, Typography, Button, message } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SwapOutlined,
  MinusCircleOutlined,
  ClockCircleOutlined,
  SendOutlined,
  LoadingOutlined,
  RedoOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import UserAvatar from '@/components/UserAvatar';
import type { ApprovalNode, ApprovalStatus, ApprovalAction, CcUser, ErpMeta } from '@/types/oa-approval';
import { oaApprovalApi } from '@/services/api/oa-approval';
import { formatDateTime } from '@/utils/format';
import styles from './ApprovalFlow.less';

const { Text } = Typography;

interface ApprovalFlowProps {
  nodes: ApprovalNode[];
  ccUsers?: CcUser[];
  currentStep: number;
  instanceStatus: ApprovalStatus;
  /** 审批操作记录，合入对应节点的描述区 */
  actions?: ApprovalAction[];
  /** 有值时在流程末尾追加 ERP 处理节点 */
  erpMeta?: ErpMeta | null;
  /** ERP 重试所需 */
  instanceId?: number;
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

/** 操作类型标签映射 */
const ACTION_TYPE_CONFIG: Record<string, { label: string; cls: string }> = {
  submit: { label: '提交', cls: styles.actionTagSubmit },
  approve: { label: '通过', cls: styles.actionTagApprove },
  reject: { label: '驳回', cls: styles.actionTagReject },
  transfer: { label: '转交', cls: styles.actionTagTransfer },
  countersign: { label: '加签', cls: styles.actionTagCountersign },
  withdraw: { label: '撤回', cls: styles.actionTagWithdraw },
};

/** ERP 状态标签映射 */
const ERP_STATUS_CONFIG: Record<string, { color: string; text: string }> = {
  pending: { color: 'default', text: '待处理' },
  paying: { color: 'processing', text: '支付中' },
  purchasing: { color: 'processing', text: '采购中' },
  storing: { color: 'processing', text: '入库中' },
  completed: { color: 'success', text: '已完成' },
  erp_failed: { color: 'error', text: '失败' },
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

/** 获取 ERP 节点图标 */
function getErpStepIcon(status: string) {
  const iconStyle: React.CSSProperties = { fontSize: 14 };
  if (status === 'erp_failed') return <CloseCircleOutlined style={{ ...iconStyle, color: '#f5222d' }} />;
  if (['paying', 'purchasing', 'storing'].includes(status)) {
    return <LoadingOutlined style={{ ...iconStyle, color: '#722ed1' }} spin />;
  }
  if (status === 'completed') return <CheckCircleOutlined style={{ ...iconStyle, color: '#52c41a' }} />;
  return <SettingOutlined style={{ ...iconStyle, color: '#722ed1' }} />;
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

/** 渲染操作记录条目（时间线合入节点） */
function renderActionEntries(actions: ApprovalAction[]) {
  return actions.map((action) => {
    const config = ACTION_TYPE_CONFIG[action.actionType];
    const operatorName = action.operatorName || action.actionUserName || '系统';
    return (
      <div key={action.id} className={styles.actionEntry}>
        <Tag className={config?.cls || styles.actionTagSubmit}>
          {config?.label || action.actionType}
        </Tag>
        <span className={styles.actionOperator}>{operatorName}</span>
        {action.comment && <span className={styles.actionComment}>{action.comment}</span>}
        <span className={styles.actionTime}>{formatDateTime(action.actionAt)}</span>
      </div>
    );
  });
}

/** ERP 处理节点组件 */
const ErpStep: React.FC<{ erpMeta: ErpMeta; instanceId?: number }> = ({ erpMeta, instanceId }) => {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    if (!instanceId) return;
    setRetrying(true);
    try {
      await oaApprovalApi.retryErpOperation(instanceId);
      message.success('ERP重试已触发，请稍后刷新查看');
    } catch (err: any) {
      message.error(err.message || '重试失败');
    } finally {
      setRetrying(false);
    }
  };

  const statusConfig = ERP_STATUS_CONFIG[erpMeta.status] || { color: 'default', text: erpMeta.status };

  return (
    <div className={styles.erpStep}>
      <div className={styles.erpInfoRow}>
        <span>状态: <Tag color={statusConfig.color}>{statusConfig.text}</Tag></span>
        <span>申请编号: {erpMeta.applicationNo || '-'}</span>
      </div>
      {erpMeta.retries > 0 && (
        <div className={styles.erpInfoRow}>
          <span>重试次数: {erpMeta.retries}</span>
        </div>
      )}
      {erpMeta.status === 'erp_failed' && (
        <div className={styles.erpErrorSection}>
          <div className={styles.erpErrorMsg}>
            {erpMeta.requestLog?.error ? String(erpMeta.requestLog.error) : '请点击重试按钮重新处理'}
          </div>
          {instanceId && (
            <Button
              size="small"
              danger
              icon={<RedoOutlined />}
              loading={retrying}
              onClick={handleRetry}
              className={styles.erpRetryBtn}
            >
              重试
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

/** 审批流程通用组件 */
const ApprovalFlow: React.FC<ApprovalFlowProps> = ({
  nodes,
  ccUsers,
  currentStep,
  instanceStatus,
  actions = [],
  erpMeta,
  instanceId,
}) => {
  const groupedNodes = groupNodesByOrder(nodes);
  const actionsByNodeOrder = groupActionsByNodeOrder(actions);
  const stepsStatus = instanceStatus === 'rejected' ? 'error' : 'process';

  return (
    <div className={styles.approvalFlow}>
      <Steps
        direction="vertical"
        current={currentStep}
        status={stepsStatus}
        className={styles.steps}
      >
        {groupedNodes.map((group) => {
          const firstNode = group[0];
          const isCurrent = firstNode.status === 'pending';
          const nodeActions = actionsByNodeOrder.get(firstNode.nodeOrder) || [];

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
                  {nodeActions.length > 0 && renderActionEntries(nodeActions)}
                </div>
              }
            />
          );
        })}
        {/* ERP 处理节点 */}
        {erpMeta && (
          <Steps.Step
            icon={getErpStepIcon(erpMeta.status)}
            title={
              <span className={styles.stepTitle}>ERP处理</span>
            }
            description={<ErpStep erpMeta={erpMeta} instanceId={instanceId} />}
          />
        )}
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
