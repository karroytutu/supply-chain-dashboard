/**
 * 退货单表格组件
 * 支持桌面端表格和移动端卡片列表
 */
import React from 'react';
import { Table, Empty, type TablePaginationConfig } from 'antd';
import type { ReturnOrder } from '@/types/procurement-return';
import { useMobileDetect } from '../hooks/useMobileDetect';
import { getReturnOrderColumns } from './returnOrderColumns';
import { ExpandedDetail } from './ExpandedDetail';
import { ReturnOrderCard } from './ReturnOrderCard';
import { MobileSkeleton } from './MobileSkeleton';
import MobilePagination from './MobilePagination';
import styles from '../index.less';

interface ReturnOrderTableProps {
  dataSource: ReturnOrder[];
  loading: boolean;
  selectedRowKeys: number[];
  onSelectChange: (keys: number[]) => void;
  pagination: {
    current: number;
    pageSize: number;
    total: number;
  };
  onPageChange: (page: number, pageSize: number) => void;
  onErpFill?: (record: ReturnOrder) => void;
  onWarehouseExecute?: (record: ReturnOrder) => void;
  onRollback?: (record: ReturnOrder) => void;
}

const ReturnOrderTable: React.FC<ReturnOrderTableProps> = ({
  dataSource,
  loading,
  selectedRowKeys,
  onSelectChange,
  pagination,
  onPageChange,
  onErpFill,
  onWarehouseExecute,
  onRollback,
}) => {
  const isMobile = useMobileDetect();
  const columns = getReturnOrderColumns({ onErpFill, onWarehouseExecute, onRollback });

  const handleTableChange = (paginationConfig: TablePaginationConfig) => {
    onPageChange(
      paginationConfig.current || 1,
      paginationConfig.pageSize || 10
    );
  };

  // 移动端渲染卡片列表
  if (isMobile) {
    return (
      <div className={styles.mobileCardList}>
        {loading && <MobileSkeleton count={3} />}

        {!loading && dataSource.length > 0 && dataSource.map(record => (
          <ReturnOrderCard
            key={record.id}
            record={record}
            onErpFill={onErpFill}
            onWarehouseExecute={onWarehouseExecute}
            onRollback={onRollback}
          />
        ))}

        {!loading && dataSource.length === 0 && (
          <div className={styles.emptyState}>
            <Empty description="暂无退货单数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        )}

        {!loading && dataSource.length > 0 && (
          <MobilePagination
            current={pagination.current}
            pageSize={pagination.pageSize}
            total={pagination.total}
            onChange={(page) => onPageChange(page, pagination.pageSize)}
          />
        )}
      </div>
    );
  }

  // 桌面端渲染表格
  return (
    <Table
      className={styles.table}
      columns={columns}
      dataSource={dataSource}
      rowKey="id"
      loading={loading}
      scroll={{ x: 920, y: 'calc(100vh - 420px)' }}
      rowSelection={{
        selectedRowKeys,
        onChange: (keys) => onSelectChange(keys as number[]),
      }}
      expandable={{
        expandedRowRender: (record) => <ExpandedDetail record={record} />,
        rowExpandable: () => true,
      }}
      pagination={{
        current: pagination.current,
        pageSize: pagination.pageSize,
        total: pagination.total,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (total) => `共 ${total} 条`,
      }}
      onChange={handleTableChange}
    />
  );
};

export { ReturnOrderTable };
export default ReturnOrderTable;
