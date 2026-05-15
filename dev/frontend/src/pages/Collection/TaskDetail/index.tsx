/**
 * 催收任务详情页
 * 整合 TaskHeader、DetailTable、ActionButtons、MoreInfo 及所有弹窗
 */
import React, { useMemo } from 'react';
import { Spin, Result, Button } from 'antd';
import { history, useParams } from 'umi';
import useTaskDetail from './hooks/useTaskDetail';
import useConfirmVerify from './hooks/useConfirmVerify';
import TaskHeader from './components/TaskHeader';
import DetailTable from './components/DetailTable';
import ActionButtons from './components/ActionButtons';
import MoreInfo from './components/MoreInfo';
import VerifyModal from '../components/VerifyModal';
import ExtensionModal from '../components/ExtensionModal';
import DifferenceModal from '../components/DifferenceModal';
import EscalateModal from '../components/EscalateModal';
import RejectVerifyModal from '../components/RejectVerifyModal';
import ResolveDifferenceModal from '../components/ResolveDifferenceModal';
import SendNoticeModal from '../components/SendNoticeModal';
import LawsuitModal from '../components/LawsuitModal';
import RollbackModal from '../components/RollbackModal';
import type { CollectionDetail } from '@/types/ar-collection';
import type { ModalType } from './hooks/useTaskDetail';
import './index.less';

const TaskDetailPage: React.FC = () => {
  const params = useParams<{ id: string }>();
  const taskId = params.id ? Number(params.id) : undefined;

  const {
    task,
    details,
    actions,
    loading,
    error,
    selectedDetailIds,
    selectedDetails,
    selectedTotal,
    activeModal,
    singleActionDetail,
    setSelectedDetailIds,
    openModal,
    closeModal,
    refresh,
  } = useTaskDetail(taskId);

  /** 弹窗操作成功回调 */
  const handleSuccess = () => {
    closeModal();
    refresh();
  };

  /** 确认核销直接执行 */
  const { execute: handleConfirmVerify, loading: confirmVerifyLoading } = useConfirmVerify({
    task,
  });

  /** 获取弹窗使用的明细列表(单条操作 or 批量选中) */
  const modalDetails = useMemo((): CollectionDetail[] => {
    if (singleActionDetail) return [singleActionDetail];
    return selectedDetails;
  }, [singleActionDetail, selectedDetails]);

  /** 行操作: 单条明细触发弹窗 */
  const handleRowAction = (type: ModalType, detail: CollectionDetail) => {
    openModal(type, detail);
  };

  /** 底部按钮操作: 使用选中明细(可能为空=整单) */
  const handleAction = (type: ModalType) => {
    openModal(type);
  };

  if (loading) {
    return (
      <div className="task-detail-loading">
        <Spin size="large" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <Result
        status="error"
        title="加载失败"
        subTitle={error || '任务不存在'}
        extra={
          <Button type="primary" onClick={() => history.back()}>
            返回列表
          </Button>
        }
      />
    );
  }

  return (
    <div className="task-detail-page">
      <TaskHeader task={task} />

      <DetailTable
        details={details}
        selectedDetailIds={selectedDetailIds}
        selectedTotal={selectedTotal}
        totalAmount={task.totalAmount}
        onSelectionChange={setSelectedDetailIds}
        onRowAction={handleRowAction}
      />

      <ActionButtons
        task={task}
        onAction={handleAction}
        onConfirmVerify={handleConfirmVerify}
        confirmVerifyLoading={confirmVerifyLoading}
      />

      <MoreInfo actions={actions} />

      {/* 弹窗集合 */}
      {task && (
        <>
          <VerifyModal
            visible={activeModal === 'verify'}
            onClose={closeModal}
            onSuccess={handleSuccess}
            task={task}
            selectedDetails={modalDetails}
          />
          <ExtensionModal
            visible={activeModal === 'extension'}
            onClose={closeModal}
            onSuccess={handleSuccess}
            task={task}
            selectedDetails={modalDetails}
          />
          <DifferenceModal
            visible={activeModal === 'difference'}
            onClose={closeModal}
            onSuccess={handleSuccess}
            task={task}
            selectedDetails={modalDetails}
          />
          <EscalateModal
            visible={activeModal === 'escalate'}
            onClose={closeModal}
            onSuccess={handleSuccess}
            task={task}
            selectedDetails={modalDetails}
          />
          <RejectVerifyModal
            visible={activeModal === 'rejectVerify'}
            onClose={closeModal}
            onSuccess={handleSuccess}
            task={task}
          />
          <ResolveDifferenceModal
            visible={activeModal === 'resolveDifference'}
            onClose={closeModal}
            onSuccess={handleSuccess}
            task={task}
            selectedDetails={modalDetails}
          />
          <SendNoticeModal
            visible={activeModal === 'sendNotice'}
            onClose={closeModal}
            onSuccess={handleSuccess}
            task={task}
            selectedDetails={modalDetails}
          />
          <LawsuitModal
            visible={activeModal === 'lawsuit'}
            onClose={closeModal}
            onSuccess={handleSuccess}
            task={task}
            selectedDetails={modalDetails}
          />
          <RollbackModal
            visible={activeModal === 'rollback'}
            onClose={closeModal}
            onSuccess={handleSuccess}
            task={task}
          />
        </>
      )}
    </div>
  );
};

export default TaskDetailPage;
