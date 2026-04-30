/**
 * 统一考核中心页面入口
 */
import React from 'react';
import { Authorized } from '@/components/Authorized';
import { PERMISSIONS } from '@/constants/permissions';
import { useAssessmentFilters } from './hooks/useAssessmentFilters';
import { useAssessmentData } from './hooks/useAssessmentData';
import { useAssessmentActions } from './hooks/useAssessmentActions';
import CategoryTabs from './components/CategoryTabs';
import AssessmentStatsCard from './components/AssessmentStats';
import AssessmentFilter from './components/AssessmentFilter';
import AssessmentTable from './components/AssessmentTable';
import HandleModal from './components/HandleModal';
import AppealModal from './components/AppealModal';
import RulesDescription from './components/RulesDescription';
import './index.less';

const AssessmentPage: React.FC = () => {
  // 筛选状态
  const {
    category,
    page,
    pageSize,
    keyword,
    ruleType,
    role,
    status,
    queryParams,
    setCategory,
    setPage,
    setFilters,
    resetFilters,
  } = useAssessmentFilters();

  // 数据获取
  const { records, total, stats, loading, reloadData } = useAssessmentData(queryParams);

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
        <CategoryTabs
          category={category}
          stats={stats}
          onChange={setCategory}
        />
        <AssessmentStatsCard stats={stats} loading={loading} />
        <AssessmentFilter
          category={category}
          keyword={keyword}
          ruleType={ruleType}
          role={role}
          status={status}
          onFilter={setFilters}
          onReset={resetFilters}
          onCalculate={() => triggerCalculation(category)}
        />
        <AssessmentTable
          category={category}
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
        <RulesDescription category={category} />
      </div>
    </Authorized>
  );
};

export default AssessmentPage;
