/**
 * 审批中心页面
 * 三栏布局：侧边导航 → 审批列表 → 审批详情（ApprovalDetailContent）
 */
import React from 'react';
import { useApprovalCenter } from './hooks/useApprovalCenter';
import ApprovalNav from './components/ApprovalNav';
import ApprovalList from './components/ApprovalList';
import ApprovalDetailPanel from './components/ApprovalDetailPanel';
import type { ViewMode } from '@/types/oa-approval';
import styles from './index.less';

const Center: React.FC = () => {
  const {
    loading, detailLoading, viewMode, stats, list, total, page,
    searchText, selectedId, detail,
    canOperate, canWithdraw,
    setViewMode, setPage, setSearchText, setSelectedId,
    handleApprove, handleReject, handleTransfer, handleWithdraw,
  } = useApprovalCenter();

  // 点击导航
  const handleNavClick = (mode: ViewMode) => {
    setViewMode(mode);
    setPage(1);
    setSelectedId(null);
  };

  // 点击列表项
  const handleItemClick = (item: any) => {
    setSelectedId(item.id);
  };

  return (
    <div className={styles.container}>
      <ApprovalNav viewMode={viewMode} stats={stats} onNavClick={handleNavClick} />

      <ApprovalList
        loading={loading}
        list={list}
        total={total}
        page={page}
        searchText={searchText}
        selectedId={selectedId}
        onSearchTextChange={setSearchText}
        onItemClick={handleItemClick}
        onPageChange={setPage}
      />

      <ApprovalDetailPanel
        detailLoading={detailLoading}
        detail={detail}
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

export default Center;
