/**
 * 退货单列表页面
 */
import React, { useCallback, useState } from 'react';
import { Card, Breadcrumb, message } from 'antd';
import { HomeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ReturnOrder, ReturnOrderStatus } from '@/types/procurement-return';
import { useReturnOrders } from './hooks/useReturnOrders';
import { useMobileDetect } from './hooks/useMobileDetect';
import { useOrderActions } from './hooks/useOrderActions';
import ReturnOrderStats from './components/ReturnOrderStats';
import ReturnOrderTable from './components/ReturnOrderTable';
import BatchActionBar from './components/BatchActionBar';
import ErpFillModal from './components/ErpFillModal';
import WarehouseExecuteModal from './components/WarehouseExecuteModal';
import { MobileFilters, MobileFilterButton, getStatusText } from './components/MobileFilters';
import { OperationGuide } from './components/OperationGuide';
import OrderFilter from './components/OrderFilter';
import styles from './index.less';

export default function ReturnOrderList() {
  const {
    loading, dataSource, total, page, pageSize, keyword, statusFilter,
    dateRange, stats, selectedRowKeys, batchLoading, setKeyword,
    setSelectedRowKeys, handleSearch, handleStatusChange,
    handleDateRangeChange, handleBatchConfirm, handlePageChange,
    fetchReturnOrders, fetchStats,
  } = useReturnOrders();

  const isMobile = useMobileDetect();
  const [filterDrawerVisible, setFilterDrawerVisible] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  const [modalType, setModalType] = useState<'erpFill' | 'warehouseExecute' | null>(null);
  const [currentRecord, setCurrentRecord] = useState<ReturnOrder | null>(null);

  const {
    onSelectChange, onSelectAllChange, onBatchConfirm, onRefresh,
    onRollback, onClearFilters, onApplyMobileFilters,
  } = useOrderActions({
    handleStatusChange, handleDateRangeChange, handleBatchConfirm,
    setSelectedRowKeys, setSelectAll, setKeyword,
    dataSource, total, selectedRowKeys, selectAll,
    fetchReturnOrders, fetchStats, handleSearch,
  });

  const onErpFill = useCallback((record: ReturnOrder) => {
    setCurrentRecord(record);
    setModalType('erpFill');
  }, []);

  const onWarehouseExecute = useCallback((record: ReturnOrder) => {
    setCurrentRecord(record);
    setModalType('warehouseExecute');
  }, []);

  const closeModal = useCallback(() => {
    setModalType(null);
    setCurrentRecord(null);
  }, []);

  const hasFilters = Boolean(keyword || statusFilter || dateRange);
  const activeStatusText = getStatusText(statusFilter);

  return (
    <div className={styles.container}>
      <Breadcrumb
        className={styles.breadcrumb}
        items={[
          { href: '/', title: <><HomeOutlined /> 首页</> },
          { title: '采购退货' },
          { title: '退货单列表' },
        ]}
      />

      <ReturnOrderStats stats={stats} activeStatus={statusFilter} onStatusClick={handleStatusChange} />

      <Card className={styles.mainCard}>
        <OrderFilter
          keyword={keyword}
          statusFilter={statusFilter}
          dateRange={dateRange}
          isMobile={isMobile}
          hasFilters={hasFilters}
          activeStatusText={activeStatusText}
          onKeywordChange={setKeyword}
          onSearch={handleSearch}
          onDateRangeChange={handleDateRangeChange}
          onRefresh={onRefresh}
          onStatusClick={handleStatusChange}
          onOpenMobileFilter={() => setFilterDrawerVisible(true)}
        />

        {!isMobile && (
          <OperationGuide
            activeStatus={statusFilter}
            selectedCount={selectAll ? total : selectedRowKeys.length}
            onBatchConfirm={onBatchConfirm}
            loading={batchLoading}
          />
        )}

        <BatchActionBar
          selectedCount={selectAll ? total : selectedRowKeys.length}
          totalCount={total}
          checked={selectAll}
          onCheckChange={onSelectAllChange}
          onBatchConfirm={onBatchConfirm}
          loading={batchLoading}
        />

        <ReturnOrderTable
          dataSource={dataSource}
          loading={loading}
          selectedRowKeys={selectAll ? dataSource.map(item => item.id) : selectedRowKeys}
          onSelectChange={onSelectChange}
          pagination={{ current: page, pageSize, total }}
          onPageChange={handlePageChange}
          onErpFill={onErpFill}
          onWarehouseExecute={onWarehouseExecute}
          onRollback={onRollback}
        />
      </Card>

      <ErpFillModal visible={modalType === 'erpFill'} record={currentRecord} onClose={closeModal} onSuccess={onRefresh} />
      <WarehouseExecuteModal visible={modalType === 'warehouseExecute'} record={currentRecord} onClose={closeModal} onSuccess={onRefresh} />

      <MobileFilters
        visible={filterDrawerVisible}
        onClose={() => setFilterDrawerVisible(false)}
        onApply={() => { setFilterDrawerVisible(false); handleSearch(); }}
        onClear={onClearFilters}
        value={{ keyword, status: statusFilter, dateRange }}
        onChange={(filters) => {
          setKeyword(filters.keyword);
          handleStatusChange(filters.status);
          handleDateRangeChange(filters.dateRange);
        }}
      />
    </div>
  );
}
