import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useParams, history } from 'umi';
import { Button, Spin, Typography, Result, Alert, message } from 'antd';
import { ArrowLeftOutlined, ClockCircleOutlined, WarningOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { type DetailErrorType, useApprovalDetail } from './hooks/useApprovalDetail';
import { ApprovalDetailContent, ApprovalStatusTag } from '@/components/Oa';
import type { EditableFormSectionRef } from '@/components/Oa/EditableFormSection';
import LicenseDeferredCard from './components/LicenseDeferredCard';
import { remindNode } from '@/services/api/oa';
import { formatDateTime } from '@/utils/format';
import styles from './index.less';

const { Text, Title } = Typography;

/** 超时信息条组件 */
function TimeoutInfoBar({
  deadlineAt, nodeName, reminderCount, ccSupervisorAt,
}: {
  deadlineAt: string;
  nodeName: string;
  reminderCount: number;
  ccSupervisorAt: string | null;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(timer);
  }, []);

  const now = Date.now();
  const deadline = new Date(deadlineAt).getTime();
  const diff = deadline - now;
  const isOverdue = diff <= 0;

  const absMs = Math.abs(diff);
  const totalMin = Math.floor(absMs / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  const durationText = days > 0 ? `${days}天${hours}小时${minutes}分` : hours > 0 ? `${hours}小时${minutes}分` : `${minutes}分钟`;

  return (
    <Alert
      type={isOverdue ? 'error' : 'warning'}
      showIcon
      icon={isOverdue ? <WarningOutlined /> : <ClockCircleOutlined />}
      message={
        <span>
          当前节点「{nodeName}」{isOverdue ? `已超时 ${durationText}` : `剩余 ${durationText}`}
        </span>
      }
      description={
        <span style={{ fontSize: 12 }}>
          截止时间: {formatDateTime(deadlineAt)}
          {reminderCount > 0 && <span style={{ marginLeft: 12 }}>已催办: {reminderCount}次</span>}
          {ccSupervisorAt && <span style={{ marginLeft: 12, color: '#fa541c' }}>上级已通知</span>}
        </span>
      }
      style={{ marginBottom: 12 }}
    />
  );
}

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
    actionLoading, actionModalVisible, actionType, actionComment, transferUsers,
    countersignUserIds, countersignType, sendBackTargets, sendBackTargetNodeOrder,
    canOperate, canWithdraw, canComment, currentStep,
    openActionModal, closeActionModal, executeAction, executeWithdraw,
    setActionComment, setTransferUserId,
    setCountersignUserIds, setCountersignType, setSendBackTargetNodeOrder,
  } = useApprovalDetail(id, editableFormRef);

  // ✅ 所有 Hooks 必须在 early return 之前调用（React Hooks 规则）
  const [remindLoading, setRemindLoading] = useState(false);
  const handleRemind = useCallback(async () => {
    if (!detail) return;
    try {
      setRemindLoading(true);
      await remindNode(detail.id);
      message.success('催办通知已发送');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '催办失败';
      message.error(errMsg);
    } finally {
      setRemindLoading(false);
    }
  }, [detail?.id]);

  if (loading) return <div className={styles.loadingContainer}><Spin size="large" /></div>;
  if (!detail) return renderErrorState(errorType, loadDetail);

  const actionState = {
    actionLoading, actionModalVisible, actionType, actionComment, transferUsers,
    countersignUserIds, countersignType, sendBackTargets, sendBackTargetNodeOrder,
    canOperate, canWithdraw, canComment, currentStep,
    openActionModal, closeActionModal, executeAction, executeWithdraw,
    setActionComment, setTransferUserId,
    setCountersignUserIds, setCountersignType, setSendBackTargetNodeOrder,
  };

  // 当前节点超时信息
  const currentNode = detail.nodes?.find(n => n.status === 'pending' && n.deadlineAt);

  const isOverdue = currentNode?.deadlineAt
    ? new Date(currentNode.deadlineAt).getTime() < Date.now()
    : false;

  const timeoutBar = currentNode?.deadlineAt ? (
    <div>
      <TimeoutInfoBar
        deadlineAt={currentNode.deadlineAt}
        nodeName={currentNode.nodeName}
        reminderCount={currentNode.reminderCount ?? 0}
        ccSupervisorAt={currentNode.ccSupervisorAt ?? null}
      />
      {isOverdue && (
        <Button
          type="primary"
          danger
          size="small"
          icon={<ThunderboltOutlined />}
          loading={remindLoading}
          onClick={handleRemind}
          style={{ marginTop: 8 }}
        >
          手动催办
        </Button>
      )}
    </div>
  ) : undefined;

  const extraContent = detail.formTypeCode === 'customer_credit' ? (
    <LicenseDeferredCard
      instanceId={detail.id}
      approvalStatus={detail.status}
      applicantId={detail.applicantId}
      customerId={detail.formData?.customerId as number | undefined}
      cardClassName={styles.card}
    />
  ) : undefined;

  // 合并 extraContent：超时提示 + 执照延期卡片
  const combinedExtra = (
    <>
      {timeoutBar}
      {extraContent}
    </>
  );

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
        formLayout="list"
        extraContentBefore={combinedExtra}
        showHeader={false}
        editableFormRef={editableFormRef}
      />
    </div>
  );
};

export default ApprovalDetailPage;
