import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, history } from 'umi';
import { Button, Spin, Typography, Result, Alert, Space } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { type DetailErrorType, useApprovalDetail } from './hooks/useApprovalDetail';
import { useErpFieldResolve } from '@/components/Oa/hooks/useErpFieldResolve';
import { DetailLeftColumn, ApprovalStatusTag } from './components/DetailSubComponents';
import { DetailRightColumn } from './components/DetailRightColumn';
import { validateActionToken, executeActionByToken } from '@/services/api/oa';
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

/** Token 快捷操作栏（从钉钉"查看详情"跳转时显示） */
const TokenActionBar: React.FC<{
  token: string;
  onActionComplete: () => void;
}> = ({ token, onActionComplete }) => {
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<'success' | 'error' | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    validateActionToken(token)
      .then((data) => {
        setTokenValid(data.valid ? true : false);
      })
      .catch(() => setTokenValid(false));
  }, [token]);

  const handleTokenAction = async (action: 'approve' | 'reject') => {
    setExecuting(true);
    try {
      await executeActionByToken(token, action);
      setResult('success');
      onActionComplete();
    } catch (err: any) {
      setResult('error');
      setErrorMsg(err.message || '操作失败');
    } finally {
      setExecuting(false);
    }
  };

  if (tokenValid === null) {
    return (
      <Alert
        message="正在验证快捷操作链接..."
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
    );
  }

  if (!tokenValid) {
    return (
      <Alert
        message="快捷操作链接已失效"
        description="此链接已过期或已被使用，请使用页面中的审批按钮操作"
        type="warning"
        showIcon
        closable
        style={{ marginBottom: 16 }}
      />
    );
  }

  if (result === 'success') {
    return (
      <Alert
        message="审批操作已完成"
        type="success"
        showIcon
        closable
        icon={<CheckCircleOutlined />}
        style={{ marginBottom: 16 }}
      />
    );
  }

  if (result === 'error') {
    return (
      <Alert
        message="操作失败"
        description={errorMsg}
        type="error"
        showIcon
        closable
        style={{ marginBottom: 16 }}
      />
    );
  }

  return (
    <Alert
      message="来自钉钉的快捷审批"
      description={
        <Space style={{ marginTop: 8 }}>
          <Button
            type="primary"
            size="small"
            icon={<CheckCircleOutlined />}
            loading={executing}
            onClick={() => handleTokenAction('approve')}
          >
            同意
          </Button>
          <Button
            danger
            size="small"
            icon={<CloseCircleOutlined />}
            loading={executing}
            onClick={() => handleTokenAction('reject')}
          >
            拒绝
          </Button>
        </Space>
      }
      type="info"
      showIcon
      closable
      style={{ marginBottom: 16 }}
    />
  );
};

const ApprovalDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get('token');
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
      {tokenParam && (
        <TokenActionBar token={tokenParam} onActionComplete={loadDetail} />
      )}
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
