/**
 * 审批中心页面
 * 三栏布局：侧边导航 → 审批列表 → 审批详情 + 流程
 */
import React from 'react';
import { Modal, Input } from 'antd';
import { useApprovalCenter } from './hooks/useApprovalCenter';
import ApprovalNav from './components/ApprovalNav';
import ApprovalList from './components/ApprovalList';
import ApprovalDetailPanel from './components/ApprovalDetailPanel';
import type { ViewMode } from '@/types/oa-approval';
import styles from './index.less';

const Center: React.FC = () => {
  const {
    loading, detailLoading, viewMode, stats, list, total, page,
    searchText, selectedId, detail, rejectModalVisible, rejectReason,
    setViewMode, setPage, setSearchText, setSelectedId,
    setRejectModalVisible, setRejectReason,
    handleApprove, handleReject, handleWithdraw,
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
        viewMode={viewMode}
        onApprove={handleApprove}
        onReject={() => setRejectModalVisible(true)}
        onWithdraw={handleWithdraw}
      />

      {/* 拒绝弹窗 */}
      <Modal
        title="拒绝审批"
        open={rejectModalVisible}
        onOk={handleReject}
        onCancel={() => {
          setRejectModalVisible(false);
          setRejectReason('');
        }}
        okText="确认拒绝"
        cancelText="取消"
      >
        <Input.TextArea
          placeholder="请输入拒绝原因"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={4}
        />
      </Modal>
    </div>
  );
};

export default Center;
