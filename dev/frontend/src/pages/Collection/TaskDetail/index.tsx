/**
 * 催收任务详情页
 * 整合 TaskHeader、FlowProgress、RoleTip、DetailTable、ActionButtons、MoreInfo、LegalProgress 及所有弹窗
 */
import React, { useMemo } from 'react';
import { Spin, Result, Button } from 'antd';
import { history, useParams } from 'umi';
import useTaskDetail from './hooks/useTaskDetail';
import TaskHeader from './components/TaskHeader';
import FlowProgress from './components/FlowProgress';
import RoleTip from './components/RoleTip';
import DetailTable from './components/DetailTable';
import ActionButtons from './components/ActionButtons';
import MoreInfo from './components/MoreInfo';
import LegalProgressSection from './components/LegalProgress';
import VerifyModal from '../components/VerifyModal';
import ExtensionModal from '../components/ExtensionModal';
import DifferenceModal from '../components/DifferenceModal';
import EscalateModal from '../components/EscalateModal';
import ConfirmVerifyModal from '../components/ConfirmVerifyModal';
import ResolveDifferenceModal from '../components/ResolveDifferenceModal';
import SendNoticeModal from '../components/SendNoticeModal';
import LawsuitModal from '../components/LawsuitModal';
import UpdateLegalProgressModal from '../components/UpdateLegalProgressModal';
import { usePermission } from '@/hooks/usePermission';
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
    legalProgress,
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

  // 获取用户角色
  const { roles } = usePermission();

  /** 弹窗操作成功回调 */
  const handleSuccess = () => {
    closeModal();
    refresh();
  };

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

  /** 获取用户主角色 */
  const userRole = useMemo(() => {
    if (roles.includes('admin')) return 'admin';
    if (roles.includes('manager')) return 'manager';
    if (roles.includes('marketing_manager')) return 'marketing_manager';
    if (roles.includes('current_accountant')) return 'current_accountant';
    if (roles.includes('finance_staff')) return 'finance_staff';
    if (roles.includes('cashier')) return 'cashier';
    if (roles.includes('marketer')) return 'marketer';
    return 'marketer';
  }, [roles]);

  if (loading) {
    return (
      <div className="task-detail-loading">
        <Spin size="large" tip="加载中..." />
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

  const showLegalProgress = task.escalationLevel === 2;

  return (
    <div className="task-detail-page">
      <TaskHeader task={task} />

      {/* 流程进度 */}
      <FlowProgress
        status={task.status}
        escalationLevel={task.escalationLevel}
        currentHandlerRole={task.currentHandlerRole}
      />

      {/* 角色提示 */}
      <RoleTip role={userRole} />

      <DetailTable
        details={details}
        selectedDetailIds={selectedDetailIds}
        selectedTotal={selectedTotal}
        totalAmount={task.totalAmount}
        onSelectionChange={setSelectedDetailIds}
        onRowAction={handleRowAction}
      />

      <ActionButtons task={task} onAction={handleAction} />

      <MoreInfo task={task} actions={actions} />

      {showLegalProgress && (
        <LegalProgressSection progress={legalProgress} onAction={handleAction} />
      )}

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
          <ConfirmVerifyModal
            visible={activeModal === 'confirmVerify'}
            onClose={closeModal}
            onSuccess={handleSuccess}
            task={task}
            selectedDetails={modalDetails}
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
          <UpdateLegalProgressModal
            visible={activeModal === 'updateLegalProgress'}
            onClose={closeModal}
            onSuccess={handleSuccess}
            task={task}
            selectedDetails={modalDetails}
          />
        </>
      )}
    </div>
  );
};

export default TaskDetailPage;
