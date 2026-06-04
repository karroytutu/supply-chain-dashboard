/**
 * 战略商品表格组件
 */
import React, { useState, useEffect } from 'react';
import { Table, Button } from 'antd';
import type { StrategicProduct, StrategicProductStatus } from '@/types/strategic-product';
import { getColumns } from '../utils/columns';
import StrategicProductToolbar from './StrategicProductToolbar';
import styles from '../index.less';

interface StrategicProductTableProps {
  dataSource: StrategicProduct[];
  total: number;
  page: number;
  pageSize: number;
  keyword: string;
  statusFilter?: StrategicProductStatus;
  loading: boolean;
  batchLoading: boolean;
  selectAll: boolean;
  selectedRowKeys: number[];
  syncLoading: boolean;
  exportLoading: boolean;
  onKeywordChange: (keyword: string) => void;
  onSearch: () => void;
  onStatusFilterChange: (status?: StrategicProductStatus) => void;
  onPageChange: (page: number, pageSize: number) => void;
  onSelectedRowKeysChange: (keys: number[]) => void;
  onSelectAllChange: (selectAll: boolean) => void;
  onConfirm: (record: StrategicProduct, confirmed: boolean) => void;
  onDelete: (id: number) => void;
  onBatchConfirm: (action: 'confirm' | 'reject') => void;
  onBatchDelete: () => void;
  onAddClick: () => void;
  onRefresh: () => void;
  onSyncCategory: () => void;
  onExport: (type: 'all' | 'page' | 'selected') => void;
}

const StrategicProductTable: React.FC<StrategicProductTableProps> = ({
  dataSource,
  total,
  page,
  pageSize,
  keyword,
  statusFilter,
  loading,
  batchLoading,
  selectAll,
  selectedRowKeys,
  syncLoading,
  exportLoading,
  onKeywordChange,
  onSearch,
  onStatusFilterChange,
  onPageChange,
  onSelectedRowKeysChange,
  onSelectAllChange,
  onConfirm,
  onDelete,
  onBatchConfirm,
  onBatchDelete,
  onAddClick,
  onRefresh,
  onSyncCategory,
  onExport,
}) => {
  const columns = getColumns(onConfirm, onDelete);

  // 移动端判断
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div className={styles.tableCard}>
      <StrategicProductToolbar
        keyword={keyword}
        statusFilter={statusFilter}
        isMobile={isMobile}
        total={total}
        selectAll={selectAll}
        selectedRowKeys={selectedRowKeys}
        syncLoading={syncLoading}
        exportLoading={exportLoading}
        batchLoading={batchLoading}
        onKeywordChange={onKeywordChange}
        onSearch={onSearch}
        onStatusFilterChange={onStatusFilterChange}
        onBatchConfirm={onBatchConfirm}
        onBatchDelete={onBatchDelete}
        onAddClick={onAddClick}
        onSyncCategory={onSyncCategory}
        onExport={onExport}
      />

      {/* 全选全部提示 */}
      {selectAll && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: '#e6f7ff', borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#1890ff' }}>已选择全部 {total} 条数据</span>
          <Button type="link" size="small" onClick={() => {
            onSelectAllChange(false);
            onSelectedRowKeysChange([]);
          }}>取消全选</Button>
        </div>
      )}

      {/* 当前页全选提示 */}
      {!selectAll && selectedRowKeys.length > 0 && selectedRowKeys.length === dataSource.length && dataSource.length < total && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: '#e6f7ff', borderRadius: 4 }}>
          <span style={{ color: '#1890ff' }}>已选择当前页 {selectedRowKeys.length} 条</span>
          <Button type="link" size="small" onClick={() => onSelectAllChange(true)} style={{ marginLeft: 8 }}>
            选择全部 {total} 条数据
          </Button>
        </div>
      )}

      <Table
        columns={columns}
        dataSource={dataSource}
        rowKey="id"
        loading={loading}
        scroll={{ x: 'max-content' }}
        rowSelection={{
          selectedRowKeys: selectAll ? dataSource.map(item => item.id) : selectedRowKeys,
          onChange: (keys) => {
            onSelectedRowKeysChange(keys as number[]);
            onSelectAllChange(false);
          },
        }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: (p, ps) => {
            onPageChange(p, ps);
          },
        }}
      />
    </div>
  );
};

export default StrategicProductTable;
