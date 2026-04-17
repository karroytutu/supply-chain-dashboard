import React from 'react';
import { Card, Button, Space, Steps, Typography, Popconfirm, Tag } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SwapOutlined,
  TeamOutlined,
  RollbackOutlined,
  UserOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import type { ApprovalDetail, ApprovalNode } from '@/types/oa-approval';
import { formatDateTime } from '@/utils/format';
import ActionModal from './ActionModal';
import styles from '../index.less';

const { Step } = Steps;
const { Text } = Typography;

interface ApprovalActionsProps {
  detail: ApprovalDetail;
  nodes: ApprovalNode[];
  canOperate: boolean;
  canWithdraw: boolean;
  actionLoading: boolean;
  actionModalVisible: boolean;
  actionType: 'approve' | 'reject' | 'transfer' | 'countersign' | null;
  actionComment: string;
  transferUserId: number | null;
  currentStep: number;
  openActionModal: (type: 'approve' | 'reject' | 'transfer' | 'countersign') => void;
  handleAction: () => Promise<void>;
  handleWithdraw: () => Promise<void>;
  setActionModalVisible: (visible: boolean) => void;
  setActionComment: (comment: string) => void;
  setTransferUserId: (id: number | null) => void;
}

/** 审批操作按钮与流程展示 */
const ApprovalActions: React.FC<ApprovalActionsProps> = ({
  detail, nodes, canOperate, canWithdraw,
  actionLoading, actionModalVisible, actionType, actionComment,
  currentStep, openActionModal, handleAction, handleWithdraw,
  setActionModalVisible, setActionComment, setTransferUserId,
}) => (
  <>
    {canOperate && (
      <Card className={styles.card}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button type="primary" icon={<CheckCircleOutlined />} block onClick={() => openActionModal('approve')}>通过</Button>
          <Button danger icon={<CloseCircleOutlined />} block onClick={() => openActionModal('reject')}>驳回</Button>
          <Button icon={<SwapOutlined />} block onClick={() => openActionModal('transfer')}>转交</Button>
          <Button icon={<TeamOutlined />} block onClick={() => openActionModal('countersign')}>加签</Button>
        </Space>
      </Card>
    )}

    {canWithdraw && !canOperate && (
      <Card className={styles.card}>
        <Popconfirm title="确定要撤回此审批吗？" onConfirm={handleWithdraw} okText="确定" cancelText="取消">
          <Button icon={<RollbackOutlined />} block loading={actionLoading}>撤回审批</Button>
        </Popconfirm>
      </Card>
    )}

    <Card title="审批流程" className={styles.card}>
      <Steps direction="vertical" current={currentStep} status={detail.status === 'rejected' ? 'error' : 'process'}>
        {nodes.map((node) => {
          let s: 'wait' | 'process' | 'finish' | 'error' = 'wait';
          if (node.status === 'approved') s = 'finish';
          else if (node.status === 'rejected') s = 'error';
          else if (node.status === 'pending') s = 'process';
          return (
            <Step
              key={node.id}
              title={node.nodeName}
              description={
                <div className={styles.stepDescription}>
                  {node.assignedUserName && <Text><UserOutlined /> {node.assignedUserName}</Text>}
                  {node.actedAt && <Text type="secondary" style={{ marginLeft: 8 }}>{formatDateTime(node.actedAt)}</Text>}
                  {node.comment && <Text type="secondary" className={styles.stepComment}>{node.comment}</Text>}
                </div>
              }
              status={s}
            />
          );
        })}
      </Steps>
    </Card>

    {(detail as any).aiRiskCheck && (
      <Card title={<span><SafetyCertificateOutlined style={{ marginRight: 8 }} />AI 风险检测</span>} className={styles.card}>
        <div className={styles.aiRiskCheck}>
          {((detail as any).aiRiskCheck?.risks || []).map((risk: { level: string; message: string }, i: number) => (
            <div key={i} className={styles.riskItem}>
              <Tag color={risk.level === 'high' ? 'red' : risk.level === 'medium' ? 'orange' : 'blue'}>
                {risk.level === 'high' ? '高风险' : risk.level === 'medium' ? '中风险' : '低风险'}
              </Tag>
              <Text>{risk.message}</Text>
            </div>
          ))}
          {!((detail as any).aiRiskCheck?.risks?.length) && <Text type="secondary">未检测到风险</Text>}
        </div>
      </Card>
    )}

    <ActionModal
      visible={actionModalVisible}
      actionType={actionType}
      actionComment={actionComment}
      actionLoading={actionLoading}
      onOk={handleAction}
      onCancel={() => { setActionModalVisible(false); setActionComment(''); setTransferUserId(null); }}
      onCommentChange={setActionComment}
      onTransferUserChange={setTransferUserId}
    />
  </>
);

export default ApprovalActions;
