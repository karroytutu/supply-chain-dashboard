/**
 * OA 审批详情独立页面
 * 使用共享 ApprovalDetailContent 组件，传入 onBack 显示返回按钮
 */
import React, { useRef } from 'react';
import { useParams, history } from 'umi';
import { Spin, Result, Button } from 'antd';
import { type DetailErrorType, useApprovalDetail } from './hooks/useApprovalDetail';
import { ApprovalDetailContent } from '@/components/Oa';
import type { EditableFormSectionRef } from '@/components/Oa/EditableFormSection';
import styles from './index.less';

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
  const editableFormRef = useRef<EditableFormSectionRef>(null);
  const {
    loading, detail, errorType, loadDetail,
    actionLoading, actionModalVisible, actionType, actionComment, attachments, transferUsers,
    countersignUserIds, countersignType, sendBackTargets, sendBackTargetNodeOrder,
    canOperate, canWithdraw, canComment, currentStep,
    openActionModal, closeActionModal, executeAction, executeWithdraw,
    setActionComment, setAttachments, setTransferUserId,
    setCountersignUserIds, setCountersignType, setSendBackTargetNodeOrder,
  } = useApprovalDetail(id, editableFormRef);

  if (loading) return <div className={styles.loadingContainer}><Spin size="large" /></div>;
  if (!detail) return renderErrorState(errorType, loadDetail);

  const actionState = {
    actionLoading, actionModalVisible, actionType, actionComment, attachments, transferUsers,
    countersignUserIds, countersignType, sendBackTargets, sendBackTargetNodeOrder,
    canOperate, canWithdraw, canComment, currentStep,
    openActionModal, closeActionModal, executeAction, executeWithdraw,
    setActionComment, setAttachments, setTransferUserId,
    setCountersignUserIds, setCountersignType, setSendBackTargetNodeOrder,
  };

  return (
    <div className={styles.detailPage}>
      <ApprovalDetailContent
        detail={detail}
        actionState={actionState}
        formLayout="list"
        onBack={() => history.back()}
        editableFormRef={editableFormRef}
      />
    </div>
  );
};

export default ApprovalDetailPage;
