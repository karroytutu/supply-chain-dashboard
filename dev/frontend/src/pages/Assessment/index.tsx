/**
 * 统一考核中心页面入口
 * 简洁的"筛选栏 + 统一列表"模式
 */
import React from 'react';
import { Authorized } from '@/components/Authorized';
import { PERMISSIONS } from '@/constants/permissions';
import { useAssessmentFilters } from './hooks/useAssessmentFilters';
import { useAssessmentData } from './hooks/useAssessmentData';
import { useAssessmentActions } from './hooks/useAssessmentActions';
import AssessmentFilter from './components/AssessmentFilter';
import AssessmentTable from './components/AssessmentTable';
import HandleModal from './components/HandleModal';
import AppealModal from './components/AppealModal';
import './index.less';

const AssessmentPage: React.FC = () => {
  // 筛选状态
  const {
    category,
    page,
    pageSize,
    keyword,
    ruleType,
    status,
    assessmentUserId,
    queryParams,
    setPage,
    setFilters,
    resetFilters,
  } = useAssessmentFilters();

  // 数据获取
  const { records, total, loading, reloadData } = useAssessmentData(queryParams);

  // 操作控制
  const {
    handleModal,
    appealModal,
    actionLoading,
    handleAction,
    submitAppeal,
    triggerCalculation,
  } = useAssessmentActions(reloadData);

  return (
    <Authorized permission={PERMISSIONS.ASSESSMENT.READ}>
      <div className="assessment-page">
        <AssessmentFilter
          category={category}
          keyword={keyword}
          ruleType={ruleType}
          status={status}
          assessmentUserId={assessmentUserId}
          onFilter={setFilters}
          onReset={resetFilters}
          onCalculate={() => triggerCalculation(
            (category || undefined) as AssessmentCategory | undefined
          )}
        />
        <AssessmentTable
          records={records}
          total={total}
          page={page}
          pageSize={pageSize}
          loading={loading}
          onPageChange={setPage}
          onHandle={(record) => handleModal.open(record)}
          onAppeal={(record) => appealModal.open(record)}
        />
        <HandleModal
          visible={handleModal.visible}
          record={handleModal.data}
          loading={actionLoading}
          onClose={handleModal.close}
          onSubmit={handleAction}
        />
        <AppealModal
          visible={appealModal.visible}
          record={appealModal.data}
          loading={actionLoading}
          onClose={appealModal.close}
          onSubmit={submitAppeal}
        />
      </div>
    </Authorized>
  );
};

export default AssessmentPage;
