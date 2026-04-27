import React from 'react';
import { useParams, history } from 'umi';
import { Button, Spin, Result } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { ApprovalStatusTag, UrgencyTag, ApprovalDetailContent } from '@/components/OaApproval';
import { useApprovalDetail } from './hooks/useApprovalDetail';
import styles from './index.less';

const ApprovalDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const {
    loading,
    detail,
    errorType,
    canOperate,
    canWithdraw,
    handleApprove,
    handleReject,
    handleTransfer,
    handleWithdraw,
    loadDetail,
  } = useApprovalDetail(id);

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
          <h4>{detail.formTypeName}</h4>
          <span>编号：{detail.instanceNo}</span>
        </div>
        <div className={styles.headerActions}>
          <ApprovalStatusTag status={detail.status} />
          {detail.urgency !== 'normal' && <UrgencyTag urgency={detail.urgency} />}
        </div>
      </div>

      {/* 审批详情内容（与审批中心共用） */}
      <ApprovalDetailContent
        detail={detail}
        loading={false}
        canOperate={canOperate}
        canWithdraw={canWithdraw}
        onApprove={handleApprove}
        onReject={handleReject}
        onTransfer={handleTransfer}
        onWithdraw={handleWithdraw}
      />
    </div>
  );
};

export default ApprovalDetailPage;
