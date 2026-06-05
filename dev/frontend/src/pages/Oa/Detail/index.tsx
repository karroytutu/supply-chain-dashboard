import React from 'react';
import { useParams, history } from 'umi';
import { Button, Spin, Typography, Result } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { type DetailErrorType, useApprovalDetail } from './hooks/useApprovalDetail';
import { ApprovalDetailContent, ApprovalStatusTag } from '@/components/Oa';
import LicenseDeferredCard from './components/LicenseDeferredCard';
import { formatDateTime } from '@/utils/format';
import styles from './index.less';

const { Text, Title } = Typography;

/** 错误状态渲染 */
const renderErrorState = (errorType: DetailErrorType, loadDetail: () => void) => {
  if (errorType === 'forbidden') {
    return <Result status="403" title="无权限查看" subTitle="您没有权限查看此流程详情"
      extra={<Button type="primary" onClick={() => history.push('/oa/center')}>返回流程中心</Button>} />;
  }
  if (errorType === 'not_found') {
    return <Result status="404" title="审批不存在或已删除" subTitle="该审批可能已被撤回或删除"
      extra={<Button type="primary" onClick={() => history.push('/oa/center')}>返回流程中心</Button>} />;
  }
  return <Result status="500" title="加载失败" subTitle="获取流程详情失败，请稍后重试"
    extra={<Button type="primary" onClick={() => loadDetail()}>重新加载</Button>} />;
};

const ApprovalDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const {
    loading, detail, errorType, loadDetail,
    actionLoading, actionModalVisible, actionType, actionComment, transferUsers,
    canOperate, canWithdraw, currentStep,
    openActionModal, closeActionModal, executeAction, executeWithdraw,
    setActionComment, setTransferUserId,
  } = useApprovalDetail(id);

  if (loading) return <div className={styles.loadingContainer}><Spin size="large" /></div>;
  if (!detail) return renderErrorState(errorType, loadDetail);

  const actionState = {
    actionLoading, actionModalVisible, actionType, actionComment, transferUsers,
    canOperate, canWithdraw, currentStep,
    openActionModal, closeActionModal, executeAction, executeWithdraw,
    setActionComment, setTransferUserId,
  };

  const extraContent = detail.formTypeCode === 'customer_credit' ? (
    <LicenseDeferredCard
      instanceId={detail.id}
      approvalStatus={detail.status}
      applicantId={detail.applicantId}
      customerId={detail.formData?.customerId as number | undefined}
      cardClassName={styles.card}
    />
  ) : undefined;

  return (
    <div className={styles.detailPage}>
      <div className={styles.pageHeader}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => history.back()}>返回</Button>
        <div className={styles.headerInfo}>
          <Title level={4}>{detail.formTypeName}</Title>
          <Text type="secondary">编号：{detail.instanceNo}</Text>
          <Text type="secondary" className={styles.headerMeta}>
            {detail.applicantName} | {detail.applicantDept || '-'} | {formatDateTime(detail.submittedAt, 'YYYY-MM-DD')}
          </Text>
        </div>
        <div className={styles.headerActions}>
          <ApprovalStatusTag status={detail.status} />
          {detail.completedAt && (
            <Text type="secondary">完成: {formatDateTime(detail.completedAt, 'YYYY-MM-DD')}</Text>
          )}
        </div>
      </div>
      <ApprovalDetailContent
        detail={detail}
        actionState={actionState}
        formLayout="descriptions"
        extraContentBefore={extraContent}
        showHeader={false}
      />
    </div>
  );
};

export default ApprovalDetailPage;
