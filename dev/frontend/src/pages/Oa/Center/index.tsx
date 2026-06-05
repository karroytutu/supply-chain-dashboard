/**
 * 流程中心页面
 * 三栏布局：侧边导航 → 审批列表 → 流程详情 + 流程
 */
import React from 'react';
import { useApprovalCenter } from './hooks/useApprovalCenter';
import { markCcRead } from '@/services/api/oa';
import ApprovalNav from './components/ApprovalNav';
import ApprovalList from './components/ApprovalList';
import ApprovalDetailPanel from './components/ApprovalDetailPanel';
import type { ViewMode } from '@/types/oa';
import styles from './index.less';

const Center: React.FC = () => {
  const { data, pagination, filters, mobile, handleActionComplete, handleWithdrawComplete } = useApprovalCenter();

  // 点击导航
  const handleNavClick = (mode: ViewMode) => {
    filters.switchViewMode(mode);
    if (mobile.isMobile) mobile.setMobileView('list');
  };

  // 点击列表项
  const handleItemClick = (item: any) => {
    filters.setSelectedId(item.id);
    if (mobile.isMobile) mobile.setMobileView('detail');

    // 抄送视图下，点击时标记已读
    if (filters.viewMode === 'cc' && item.isUnread) {
      markCcRead(item.id).then(() => {
        data.loadList();
        data.loadStats();
      }).catch(() => {/* 静默失败 */});
    }
  };

  // 移动端返回列表
  const handleBackToList = () => {
    mobile.setMobileView('list');
    filters.setSelectedId(null);
  };

  return (
    <div className={styles.container}>
      <ApprovalNav viewMode={filters.viewMode} stats={data.stats} onNavClick={handleNavClick} />

      {!mobile.isMobile ? (
        // 桌面端：三栏布局
        <>
          <ApprovalList
            loading={data.loading}
            list={data.list}
            total={data.total}
            page={pagination.page}
            searchText={filters.searchText}
            selectedId={filters.selectedId}
            onSearchTextChange={filters.setSearchText}
            onItemClick={handleItemClick}
            onPageChange={filters.setPage}
          />
          <ApprovalDetailPanel
            selectedId={filters.selectedId}
            viewMode={filters.viewMode}
            onActionComplete={handleActionComplete}
            onWithdrawComplete={handleWithdrawComplete}
          />
        </>
      ) : mobile.mobileView === 'list' ? (
        // 移动端：列表视图
        <ApprovalList
          loading={data.loading}
          list={data.list}
          total={data.total}
          page={pagination.page}
          searchText={filters.searchText}
          selectedId={filters.selectedId}
          onSearchTextChange={filters.setSearchText}
          onItemClick={handleItemClick}
          onPageChange={filters.setPage}
        />
      ) : (
        // 移动端：详情视图（带返回按钮）
        <ApprovalDetailPanel
          isMobile
          onBack={handleBackToList}
          selectedId={filters.selectedId}
          viewMode={filters.viewMode}
          onActionComplete={handleActionComplete}
          onWithdrawComplete={handleWithdrawComplete}
        />
      )}
    </div>
  );
};

export default Center;
