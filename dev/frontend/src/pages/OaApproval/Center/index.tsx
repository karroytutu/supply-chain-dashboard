/**
 * 审批中心页面
 * 三栏布局：侧边导航 → 审批列表 → 审批详情 + 流程
 */
import React from 'react';
import { Modal, Input, Select } from 'antd';
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
    transferModalVisible, transferUsers, transferUserId,
    setViewMode, setPage, setSearchText, setSelectedId,
    setRejectModalVisible, setRejectReason,
    setTransferModalVisible, setTransferUserId,
    openTransferModal, handleTransfer,
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
        onTransfer={openTransferModal}
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

      {/* 转交弹窗 */}
      <Modal
        title="转交审批"
        open={transferModalVisible}
        onOk={handleTransfer}
        onCancel={() => {
          setTransferModalVisible(false);
          setTransferUserId(null);
        }}
        okText="确认转交"
        cancelText="取消"
      >
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>转交人员：</label>
          <Select
            style={{ width: '100%' }}
            placeholder="请选择转交人员"
            value={transferUserId}
            onChange={(value) => setTransferUserId(value)}
            showSearch
            optionFilterProp="label"
            options={transferUsers.map((u) => ({ value: u.id, label: u.name }))}
          />
        </div>
      </Modal>
    </div>
  );
};

export default Center;
