import React from 'react';
import { useParams, history } from 'umi';
import { Button, Spin, Typography, Result } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { type DetailErrorType, useApprovalDetail } from './hooks/useApprovalDetail';
import { useErpFieldResolve } from '@/components/Oa/hooks/useErpFieldResolve';
import { DetailLeftColumn, ApprovalStatusTag } from './components/DetailSubComponents';
import { DetailRightColumn } from './components/DetailRightColumn';
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
    loading, detail, nodes, actions, errorType, actionLoading,
    actionModalVisible, actionType, actionComment, transferUsers,
    setActionModalVisible, setActionComment, setTransferUserId,
    openActionModal, handleAction, handleWithdraw, canOperate, canWithdraw, getCurrentStep, loadDetail,
  } = useApprovalDetail(id);

  const { resolvedMap } = useErpFieldResolve(detail?.formSchema, detail?.formData);

  if (loading) return <div className={styles.loadingContainer}><Spin size="large" /></div>;
  if (!detail) return renderErrorState(errorType, loadDetail);

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
      <div className={styles.detailBody}>
        <div className={styles.detailLeft}>
          <DetailLeftColumn detail={detail} resolvedMap={resolvedMap} />
        </div>
        <div className={styles.detailRight}>
          <DetailRightColumn detail={detail} nodes={nodes} actions={actions}
            actionLoading={actionLoading} actionModalVisible={actionModalVisible} actionType={actionType}
            actionComment={actionComment} transferUsers={transferUsers} getCurrentStep={getCurrentStep}
            canOperate={canOperate} canWithdraw={canWithdraw} openActionModal={openActionModal}
            handleAction={handleAction} handleWithdraw={handleWithdraw}
            setActionModalVisible={setActionModalVisible} setActionComment={setActionComment}
            setTransferUserId={setTransferUserId} />
        </div>
      </div>
    </div>
  );
};

export default ApprovalDetailPage;
