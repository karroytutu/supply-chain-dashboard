import React from 'react';
import { Card, Button, Space, Typography, Popconfirm, Tag } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SwapOutlined,
  TeamOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import type { ApprovalDetail, ApprovalNode } from '@/types/oa-approval';
import ApprovalFlow from '@/components/OaApproval/ApprovalFlow';
import ActionModal from './ActionModal';
import styles from '../index.less';

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
  transferUsers: Array<{ id: number; name: string }>;
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
  transferUserId, transferUsers,
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
      <ApprovalFlow
        nodes={nodes}
        ccUsers={detail.ccUsers}
        currentStep={currentStep}
        instanceStatus={detail.status}
      />
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
      transferUsers={transferUsers}
      onOk={handleAction}
      onCancel={() => { setActionModalVisible(false); setActionComment(''); setTransferUserId(null); }}
      onCommentChange={setActionComment}
      onTransferUserChange={setTransferUserId}
    />
  </>
);

export default ApprovalActions;
