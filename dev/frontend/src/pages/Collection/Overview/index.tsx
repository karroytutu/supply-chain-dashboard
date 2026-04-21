/**
 * 催收总览页面 - 列表页
 * 逾期催收管理的主入口页面
 * 优化：集成批量操作、表格列合并、筛选板块UX优化
 */
import React, { useCallback, useState } from 'react';
import { message } from 'antd';
import { Authorized } from '@/components/Authorized';
import { PERMISSIONS } from '@/constants/permissions';
import useOverview from './hooks/useOverview';
import useMedia from './hooks/useMedia';
import MyTasksPanel from './components/MyTasksPanel';
import WarningPanel from './components/WarningPanel';
import WarningDetailModal from './components/WarningDetailModal';
import FilterBar from './components/FilterBar';
import CollectionStats from './components/CollectionStats';
import StatusDistribution from './components/StatusDistribution';
import CollectionTable from './components/CollectionTable';
import BatchActionBar from './components/BatchActionBar';
import VerifyModal from '../components/VerifyModal';
import ExtensionModal from '../components/ExtensionModal';
import DifferenceModal from '../components/DifferenceModal';
import EscalateModal from '../components/EscalateModal';
import { getUpcomingWarnings } from '@/services/api/ar-collection';
import type { CollectionTask, UpcomingWarning, WarningLevel } from '@/types/ar-collection';
import './index.less';

const CollectionOverview: React.FC = () => {
  const overview = useOverview();
  const { isMobile } = useMedia();

  // 弹窗状态
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<CollectionTask | null>(null);

  // 预警明细弹窗状态
  const [warningModalVisible, setWarningModalVisible] = useState(false);
  const [warningModalLevel, setWarningModalLevel] = useState<WarningLevel | null>(null);
  const [warningDetailData, setWarningDetailData] = useState<UpcomingWarning[]>([]);
  const [warningDetailLoading, setWarningDetailLoading] = useState(false);

  /** 预警卡片点击 */
  const handleWarningCardClick = useCallback(async (level: WarningLevel) => {
    setWarningModalLevel(level);
    setWarningModalVisible(true);
    setWarningDetailLoading(true);
    try {
      const params: { warningLevel: WarningLevel; managerUserId?: number } = { warningLevel: level };
      if (overview.handlerId) {
        params.managerUserId = overview.handlerId;
      }
      const data = await getUpcomingWarnings(params);
      setWarningDetailData(data.details || []);
    } catch (error) {
      console.error('获取预警明细失败:', error);
    } finally {
      setWarningDetailLoading(false);
    }
  }, [overview.handlerId]);

  /** 待办卡片点击 */
  const handleTaskCardClick = useCallback(
    (filterType: string) => {
      if (filterType === 'collecting') {
        overview.setStatusTab('collecting');
      } else if (filterType === 'extension' || filterType === 'todayDue') {
        overview.setStatusTab('extension');
      } else if (filterType === 'escalated') {
        overview.setStatusTab('escalated');
      } else if (filterType === 'difference') {
        overview.setStatusTab('difference_processing');
      } else if (filterType === 'pending_verify') {
        overview.setStatusTab('pending_verify');
      }
      // timeout 筛选功能已移除
    },
    [overview],
  );

  /** 状态分布图点击 */
  const handleStatusChartClick = useCallback(
    (status: string) => {
      overview.setStatusTab(status as any);
    },
    [overview],
  );

  /** 操作菜单处理 */
  const handleAction = useCallback((action: string, task: CollectionTask) => {
    setSelectedTask(task);
    setActiveModal(action);
  }, []);

  /** 关闭弹窗 */
  const handleModalClose = useCallback(() => {
    setActiveModal(null);
    setSelectedTask(null);
  }, []);

  /** 操作成功回调 */
  const handleActionSuccess = useCallback(() => {
    handleModalClose();
    overview.refresh();
  }, [handleModalClose, overview.refresh]);

  /** 批量核销 */
  const handleBatchVerify = useCallback(() => {
    message.info('批量核销功能开发中...');
    // TODO: 实现批量核销逻辑
  }, []);

  /** 批量延期 */
  const handleBatchExtension = useCallback(() => {
    message.info('批量延期功能开发中...');
    // TODO: 实现批量延期逻辑
  }, []);

  /** 批量升级 */
  const handleBatchEscalate = useCallback(() => {
    message.info('批量升级功能开发中...');
    // TODO: 实现批量升级逻辑
  }, []);

  /** 选择变更 */
  const handleSelectionChange = useCallback(
    (keys: number[], rows: CollectionTask[]) => {
      overview.setSelection(keys, rows);
    },
    [overview],
  );

  return (
    <Authorized permission={PERMISSIONS.AR.COLLECTION.READ}>
      <div className="collection-overview-page">
        {/* 页面头部 */}
        <div className="page-header">
          <h1>逾期催收管理</h1>
          <div className="header-actions">
            <span className="sync-status">
              <span className="status-dot" />
              同步状态
            </span>
          </div>
        </div>

        {/* 我的待办面板 */}
        <MyTasksPanel
          userRole={overview.userRole}
          myTasks={overview.myTasks}
          onCardClick={handleTaskCardClick}
        />

        {/* 逾期前预警面板 */}
        <WarningPanel
          summary={overview.warningSummary}
          onCardClick={handleWarningCardClick}
        />

        {/* 筛选栏 */}
        <FilterBar
          searchKeyword={overview.searchKeyword}
          handlers={overview.handlers}
          selectedHandlerId={overview.handlerId}
          dateRange={overview.dateRange}
          statusTab={overview.statusTab}
          onSearch={overview.setSearchKeyword}
          onHandlerChange={overview.setHandlerId}
          onDateRangeChange={overview.setDateRange}
          onStatusTabChange={overview.setStatusTab}
          onClearAll={overview.clearAllFilters}
          isMobile={isMobile}
          isAdmin={overview.isAdmin}
        />

        {/* 指标卡 */}
        <CollectionStats
          stats={overview.stats}
          loading={overview.statsLoading}
          activeMetric={overview.metricFilter}
          onMetricClick={overview.setMetricFilter}
        />

        {/* 状态分布图 + 任务列表 */}
        <div className="main-content">
          <StatusDistribution
            stats={overview.stats}
            highlightedStatus={overview.statusTab !== 'all' ? overview.statusTab : null}
            onStatusClick={handleStatusChartClick}
            onRefresh={overview.refresh}
          />
          <div className="table-wrapper">
            <BatchActionBar
              selectedCount={overview.selectedRowKeys.length}
              selectedTasks={overview.selectedRows}
              onBatchVerify={handleBatchVerify}
              onBatchExtension={handleBatchExtension}
              onBatchEscalate={handleBatchEscalate}
              onClearSelection={overview.clearSelection}
            />
            <CollectionTable
              tasks={overview.tasks}
              loading={overview.loading}
              total={overview.total}
              page={overview.page}
              pageSize={overview.pageSize}
              statusTab={overview.statusTab}
              userRole={overview.userRole}
              selectedRowKeys={overview.selectedRowKeys}
              onStatusTabChange={overview.setStatusTab}
              onPageChange={overview.setPage}
              onPageSizeChange={overview.setPageSize}
              onAction={handleAction}
              onSelectionChange={handleSelectionChange}
            />
          </div>
        </div>

        {/* 操作弹窗 */}
        {selectedTask && (
          <>
            <VerifyModal
              visible={activeModal === 'verify'}
              task={selectedTask}
              selectedDetails={[]}
              onClose={handleModalClose}
              onSuccess={handleActionSuccess}
            />
            <ExtensionModal
              visible={activeModal === 'extension'}
              task={selectedTask}
              selectedDetails={[]}
              onClose={handleModalClose}
              onSuccess={handleActionSuccess}
            />
            <DifferenceModal
              visible={activeModal === 'difference'}
              task={selectedTask}
              selectedDetails={[]}
              onClose={handleModalClose}
              onSuccess={handleActionSuccess}
            />
            <EscalateModal
              visible={activeModal === 'escalate'}
              task={selectedTask}
              selectedDetails={[]}
              onClose={handleModalClose}
              onSuccess={handleActionSuccess}
            />
          </>
        )}

        {/* 预警明细弹窗 */}
        <WarningDetailModal
          visible={warningModalVisible}
          level={warningModalLevel}
          data={warningDetailData}
          loading={warningDetailLoading}
          onClose={() => setWarningModalVisible(false)}
        />
      </div>
    </Authorized>
  );
};

export default CollectionOverview;
