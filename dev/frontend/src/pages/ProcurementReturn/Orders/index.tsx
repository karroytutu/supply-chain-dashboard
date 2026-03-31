/**
 * 退货单列表页面
 */
import React, { useCallback, useState } from 'react';
import { Card, Input, DatePicker, Button, Space, Breadcrumb, Modal, message } from 'antd';
import { SearchOutlined, ReloadOutlined, HomeOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ReturnOrder, ReturnOrderStatus } from '@/types/procurement-return';
import { useReturnOrders } from './hooks/useReturnOrders';
import { useMobileDetect } from './hooks/useMobileDetect';
import ReturnOrderStats from './components/ReturnOrderStats';
import ReturnOrderTable from './components/ReturnOrderTable';
import BatchActionBar from './components/BatchActionBar';
import ErpFillModal from './components/ErpFillModal';
import WarehouseExecuteModal from './components/WarehouseExecuteModal';
import { MobileFilters, MobileFilterButton, getStatusText } from './components/MobileFilters';
import { rollbackReturnOrder } from '@/services/api/procurement-return';
import styles from './index.less';

const { RangePicker } = DatePicker;

export default function ReturnOrderList() {
  const {
    loading,
    dataSource,
    total,
    page,
    pageSize,
    keyword,
    statusFilter,
    dateRange,
    stats,
    selectedRowKeys,
    batchLoading,
    setKeyword,
    setSelectedRowKeys,
    handleSearch,
    handleStatusChange,
    handleDateRangeChange,
    handleBatchConfirm,
    handlePageChange,
    fetchReturnOrders,
    fetchStats,
  } = useReturnOrders();

  // 移动端检测
  const isMobile = useMobileDetect();

  // 移动端筛选抽屉状态
  const [filterDrawerVisible, setFilterDrawerVisible] = useState(false);

  // 全选状态
  const [selectAll, setSelectAll] = useState(false);

  // 流程操作弹窗状态
  const [modalType, setModalType] = useState<'erpFill' | 'warehouseExecute' | null>(null);
  const [currentRecord, setCurrentRecord] = useState<ReturnOrder | null>(null);

  // 处理状态筛选点击
  const onStatusClick = useCallback((status?: ReturnOrderStatus) => {
    handleStatusChange(status);
  }, [handleStatusChange]);

  // 处理选择变更
  const onSelectChange = useCallback((keys: number[]) => {
    setSelectedRowKeys(keys);
    setSelectAll(false);
  }, [setSelectedRowKeys]);

  // 处理全选变更
  const onSelectAllChange = useCallback((checked: boolean) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedRowKeys(dataSource.map(item => item.id));
    } else {
      setSelectedRowKeys([]);
    }
  }, [dataSource, setSelectedRowKeys]);

  // 批量确认
  const onBatchConfirm = useCallback(async (canReturn: boolean) => {
    const success = await handleBatchConfirm(canReturn);
    if (success) {
      setSelectAll(false);
    }
  }, [handleBatchConfirm]);

  // 打开ERP填写弹窗
  const onErpFill = useCallback((record: ReturnOrder) => {
    setCurrentRecord(record);
    setModalType('erpFill');
  }, []);

  // 打开仓储执行弹窗
  const onWarehouseExecute = useCallback((record: ReturnOrder) => {
    setCurrentRecord(record);
    setModalType('warehouseExecute');
  }, []);

  // 关闭流程操作弹窗
  const closeModal = useCallback(() => {
    setModalType(null);
    setCurrentRecord(null);
  }, []);

  // 刷新
  const onRefresh = useCallback(() => {
    fetchReturnOrders();
    fetchStats();
  }, [fetchReturnOrders, fetchStats]);

  // 回退退货单
  const onRollback = useCallback((record: ReturnOrder) => {
    Modal.confirm({
      title: '确认回退',
      icon: <ExclamationCircleOutlined />,
      content: (
        <div>
          <p>确定要将退货单 <strong>{record.sourceBillNo}</strong> 回退到待确认状态吗？</p>
          <p>回退后可以重新选择「可退货」或「不可退货」。</p>
        </div>
      ),
      okText: '确认回退',
      cancelText: '取消',
      onOk: async () => {
        try {
          await rollbackReturnOrder(record.id);
          message.success('回退成功');
          onRefresh();
        } catch (error) {
          message.error(error instanceof Error ? error.message : '回退失败');
        }
      },
    });
  }, [onRefresh]);

  // 移动端筛选相关
  const hasFilters = Boolean(keyword || statusFilter || dateRange);
  const activeStatusText = getStatusText(statusFilter);

  // 清除筛选
  const onClearFilters = useCallback(() => {
    setKeyword('');
    handleStatusChange(undefined);
    handleDateRangeChange(null);
  }, [setKeyword, handleStatusChange, handleDateRangeChange]);

  // 应用移动端筛选
  const onApplyMobileFilters = useCallback(() => {
    setFilterDrawerVisible(false);
    handleSearch();
  }, [handleSearch]);

  return (
    <div className={styles.container}>
      {/* 面包屑 */}
      <Breadcrumb
        className={styles.breadcrumb}
        items={[
          { href: '/', title: <><HomeOutlined /> 首页</> },
          { title: '采购退货' },
          { title: '退货单列表' },
        ]}
      />

      {/* 统计卡片 */}
      <ReturnOrderStats
        stats={stats}
        activeStatus={statusFilter}
        onStatusClick={onStatusClick}
      />

      {/* 主内容区 */}
      <Card className={styles.mainCard}>
        {/* 搜索筛选区 */}
        {isMobile ? (
          <div className={styles.mobileToolbar}>
            <MobileFilterButton
              hasFilters={hasFilters}
              activeStatusText={activeStatusText}
              onClick={() => setFilterDrawerVisible(true)}
            />
            <Button icon={<ReloadOutlined />} onClick={onRefresh}>
              刷新
            </Button>
          </div>
        ) : (
          <div className={styles.toolbar}>
            <Space size="middle" wrap>
              <Input
                placeholder="搜索退货单号/商品名称"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                onPressEnter={handleSearch}
                prefix={<SearchOutlined />}
                style={{ width: 220 }}
                allowClear
              />
              <RangePicker
                value={dateRange}
                onChange={dates => handleDateRangeChange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
                style={{ width: 260 }}
                placeholder={['开始日期', '结束日期']}
              />
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                搜索
              </Button>
              <Button icon={<ReloadOutlined />} onClick={onRefresh}>
                刷新
              </Button>
            </Space>
          </div>
        )}

        {/* 批量操作栏 */}
        <BatchActionBar
          selectedCount={selectAll ? total : selectedRowKeys.length}
          totalCount={total}
          checked={selectAll}
          onCheckChange={onSelectAllChange}
          onBatchConfirm={onBatchConfirm}
          loading={batchLoading}
        />

        {/* 表格 */}
        <ReturnOrderTable
          dataSource={dataSource}
          loading={loading}
          selectedRowKeys={selectAll ? dataSource.map(item => item.id) : selectedRowKeys}
          onSelectChange={onSelectChange}
          pagination={{
            current: page,
            pageSize,
            total,
          }}
          onPageChange={handlePageChange}
          onErpFill={onErpFill}
          onWarehouseExecute={onWarehouseExecute}
          onRollback={onRollback}
        />
      </Card>

      {/* ERP填写弹窗 */}
      <ErpFillModal
        visible={modalType === 'erpFill'}
        record={currentRecord}
        onClose={closeModal}
        onSuccess={onRefresh}
      />

      {/* 仓储执行弹窗 */}
      <WarehouseExecuteModal
        visible={modalType === 'warehouseExecute'}
        record={currentRecord}
        onClose={closeModal}
        onSuccess={onRefresh}
      />

      {/* 移动端筛选抽屉 */}
      <MobileFilters
        visible={filterDrawerVisible}
        onClose={() => setFilterDrawerVisible(false)}
        onApply={onApplyMobileFilters}
        onClear={onClearFilters}
        value={{
          keyword,
          status: statusFilter,
          dateRange,
        }}
        onChange={(filters) => {
          setKeyword(filters.keyword);
          handleStatusChange(filters.status);
          handleDateRangeChange(filters.dateRange);
        }}
      />
    </div>
  );
}
