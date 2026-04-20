import React from 'react';
import { useParams, history } from 'umi';
import {
  Card,
  Descriptions,
  Button,
  Tag,
  Spin,
  Row,
  Col,
  Typography,
} from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import type { ApprovalDetail } from '@/types/oa-approval';
import { formatDateTime } from '@/utils/format';
import { useApprovalDetail } from './hooks/useApprovalDetail';
import ApprovalTimeline from './components/ApprovalTimeline';
import ApprovalActions from './components/ApprovalActions';
import ErpStatusCard from './components/ErpStatusCard';
import styles from './index.less';

const { Text, Title } = Typography;

// 审批状态标签
const ApprovalStatusTag: React.FC<{ status: string }> = ({ status }) => {
  const statusMap: Record<string, { color: string; text: string }> = {
    pending: { color: 'processing', text: '审批中' },
    approved: { color: 'success', text: '已通过' },
    rejected: { color: 'error', text: '已驳回' },
    withdrawn: { color: 'default', text: '已撤回' },
    cancelled: { color: 'warning', text: '已取消' },
  };
  const config = statusMap[status] || { color: 'default', text: status };
  return <Tag color={config.color}>{config.text}</Tag>;
};

// 紧急程度标签
const UrgencyTag: React.FC<{ urgency: string }> = ({ urgency }) => {
  const urgencyMap: Record<string, { color: string; text: string }> = {
    normal: { color: 'default', text: '普通' },
    urgent: { color: 'warning', text: '紧急' },
    very_urgent: { color: 'error', text: '非常紧急' },
  };
  const config = urgencyMap[urgency] || { color: 'default', text: urgency };
  return <Tag color={config.color}>{config.text}</Tag>;
};

const ApprovalDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const {
    loading,
    detail,
    nodes,
    actions,
    actionLoading,
    actionModalVisible,
    actionType,
    actionComment,
    transferUserId,
    setActionModalVisible,
    setActionComment,
    setTransferUserId,
    openActionModal,
    handleAction,
    handleWithdraw,
    canOperate,
    canWithdraw,
    getCurrentStep,
  } = useApprovalDetail(id);

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Spin size="large" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className={styles.errorContainer}>
        <Text>审批不存在或已删除</Text>
        <Button type="primary" onClick={() => history.push('/oa/center')}>
          返回审批中心
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.detailPage}>
      {/* 顶部导航 */}
      <div className={styles.pageHeader}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => history.back()}>返回</Button>
        <div className={styles.headerInfo}>
          <Title level={4}>{detail.formTypeName}</Title>
          <Text type="secondary">编号：{detail.instanceNo}</Text>
        </div>
        <div className={styles.headerActions}>
          <ApprovalStatusTag status={detail.status} />
          <UrgencyTag urgency={detail.urgency} />
        </div>
      </div>

      <Row gutter={24}>
        {/* 左侧：表单内容 */}
        <Col span={16}>
          {/* 基本信息卡片 */}
          <Card title="基本信息" className={styles.card}>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="申请编号">{detail.instanceNo}</Descriptions.Item>
              <Descriptions.Item label="申请类型">{detail.formTypeName}</Descriptions.Item>
              <Descriptions.Item label="申请人">{detail.applicantName}</Descriptions.Item>
              <Descriptions.Item label="申请部门">{detail.applicantDept || '-'}</Descriptions.Item>
              <Descriptions.Item label="申请时间">{formatDateTime(detail.submittedAt)}</Descriptions.Item>
              <Descriptions.Item label="紧急程度"><UrgencyTag urgency={detail.urgency} /></Descriptions.Item>
              <Descriptions.Item label="审批状态" span={2}>
                <ApprovalStatusTag status={detail.status} />
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {/* ERP 处理状态卡片 */}
          {detail.erpMeta && (
            <ErpStatusCard
              instanceId={detail.id}
              erpMeta={detail.erpMeta}
              cardClassName={styles.card}
            />
          )}

          {/* 表单内容卡片 */}
          <Card title="表单内容" className={styles.card}>
            <Descriptions column={2} bordered size="small">
              {Object.entries(detail.formData).map(([key, value]) => (
                <Descriptions.Item key={key} label={key}>
                  {typeof value === 'object' ? JSON.stringify(value) : String(value ?? '-')}
                </Descriptions.Item>
              ))}
            </Descriptions>
          </Card>

          {/* 审批记录 */}
          <ApprovalTimeline actions={actions} />
        </Col>

        {/* 右侧：审批流程 */}
        <Col span={8}>
          <ApprovalActions
            detail={detail}
            nodes={nodes}
            canOperate={canOperate()}
            canWithdraw={canWithdraw()}
            actionLoading={actionLoading}
            actionModalVisible={actionModalVisible}
            actionType={actionType}
            actionComment={actionComment}
            transferUserId={transferUserId}
            currentStep={getCurrentStep()}
            openActionModal={openActionModal}
            handleAction={handleAction}
            handleWithdraw={handleWithdraw}
            setActionModalVisible={setActionModalVisible}
            setActionComment={setActionComment}
            setTransferUserId={setTransferUserId}
          />
        </Col>
      </Row>
    </div>
  );
};

export default ApprovalDetailPage;
