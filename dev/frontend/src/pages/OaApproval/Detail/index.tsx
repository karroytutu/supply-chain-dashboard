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
  Result,
} from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import type { ApprovalDetail } from '@/types/oa-approval';
import { formatDateTime } from '@/utils/format';
import { useApprovalDetail } from './hooks/useApprovalDetail';
import ApprovalTimeline from './components/ApprovalTimeline';
import ApprovalActions from './components/ApprovalActions';
import ErpStatusCard from './components/ErpStatusCard';
import { FormFieldRenderer as FieldRenderer } from '@/components/OaApproval';
import { useErpFieldResolve } from '@/components/OaApproval/hooks/useErpFieldResolve';
import { checkCondition } from '../Form/components/ConditionalFieldWrapper';
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
    errorType,
    actionLoading,
    actionModalVisible,
    actionType,
    actionComment,
    transferUserId,
    transferUsers,
    setActionModalVisible,
    setActionComment,
    setTransferUserId,
    openActionModal,
    handleAction,
    handleWithdraw,
    canOperate,
    canWithdraw,
    getCurrentStep,
    loadDetail,
  } = useApprovalDetail(id);

  // 批量预解析 ERP 字段 ID
  const { resolvedMap } = useErpFieldResolve(detail?.formSchema, detail?.formData);

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <Spin size="large" />
      </div>
    );
  }

  if (!detail) {
    if (errorType === 'forbidden') {
      return (
        <Result
          status="403"
          title="无权限查看"
          subTitle="您没有权限查看此审批详情"
          extra={<Button type="primary" onClick={() => history.push('/oa/center')}>返回审批中心</Button>}
        />
      );
    }
    if (errorType === 'not_found') {
      return (
        <Result
          status="404"
          title="审批不存在或已删除"
          subTitle="该审批可能已被撤回或删除"
          extra={<Button type="primary" onClick={() => history.push('/oa/center')}>返回审批中心</Button>}
        />
      );
    }
    return (
      <Result
        status="500"
        title="加载失败"
        subTitle="获取审批详情失败，请稍后重试"
        extra={<Button type="primary" onClick={() => loadDetail()}>重新加载</Button>}
      />
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
              {detail.formSchema?.fields?.map((field) => {
                const value = detail.formData[field.key];
                // 条件显示：不满足条件时隐藏字段
                if (field.visibleWhen && !checkCondition(field.visibleWhen, detail.formData)) {
                  return null;
                }
                // 跳过内部字段（以下划线开头）
                if (field.key.startsWith('_')) return null;
                return (
                  <Descriptions.Item key={field.key} label={field.label}>
                    <FieldRenderer field={field} value={value} formData={detail.formData} resolvedMap={resolvedMap} />
                  </Descriptions.Item>
                );
              })}
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
            transferUsers={transferUsers}
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
