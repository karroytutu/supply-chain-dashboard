/**
 * 催收总览页面 - 列表页
 * 逾期催收管理的主入口页面
 * 优化：表格列合并、筛选板块UX优化
 */
import React, { useCallback, useState } from 'react';
import { Authorized } from '@/components/Authorized';
import { PERMISSIONS } from '@/constants/permissions';
import useOverview from './hooks/useOverview';
import useMedia from './hooks/useMedia';
import WarningPanel from './components/WarningPanel';
import WarningDetailModal from './components/WarningDetailModal';
import FilterBar from './components/FilterBar';
import CollectionTable from './components/CollectionTable';
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

        {/* 任务列表 */}
        <div className="main-content">
          <div className="table-wrapper">
            <CollectionTable
              tasks={overview.tasks}
              loading={overview.loading}
              total={overview.total}
              page={overview.page}
              pageSize={overview.pageSize}
              statusTab={overview.statusTab}
              stats={overview.stats}
              onStatusTabChange={overview.setStatusTab}
              onPageChange={overview.setPage}
              onPageSizeChange={overview.setPageSize}
              onAction={handleAction}
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
