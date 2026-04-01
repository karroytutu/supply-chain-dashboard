/**
 * 战略商品表格组件
 */
import React, { useState, useEffect } from 'react';
import { Table, Input, Button, Space, Badge, Dropdown, Segmented, Select } from 'antd';
import { SearchOutlined, PlusOutlined, DeleteOutlined, CheckOutlined, CloseOutlined, DownOutlined, SyncOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import type { StrategicProduct, StrategicProductStatus } from '@/types/strategic-product';
import { getColumns } from '../utils/columns';
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

  // 批量操作菜单
  const batchMenuItems: MenuProps['items'] = [
    { key: 'confirm', label: '批量确认', icon: <CheckOutlined /> },
    { key: 'reject', label: '批量驳回', icon: <CloseOutlined /> },
    { type: 'divider' },
    { key: 'delete', label: '批量删除', icon: <DeleteOutlined />, danger: true },
  ];

  const handleBatchMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'confirm') onBatchConfirm('confirm');
    else if (key === 'reject') onBatchConfirm('reject');
    else if (key === 'delete') onBatchDelete();
  };

  return (
    <div className={styles.tableCard}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <Input
            placeholder="搜索商品名称/编码"
            value={keyword}
            onChange={e => onKeywordChange(e.target.value)}
            onPressEnter={onSearch}
            style={{ width: isMobile ? '100%' : 200 }}
            prefix={<SearchOutlined />}
          />
          {isMobile ? (
            <Select
              value={statusFilter ?? 'all'}
              onChange={(val) => onStatusFilterChange(val === 'all' ? undefined : val as StrategicProductStatus)}
              style={{ width: '100%' }}
              options={[
                { value: 'all', label: '全部' },
                { value: 'pending', label: '待确认' },
                { value: 'confirmed', label: '已确认' },
                { value: 'rejected', label: '已驳回' },
              ]}
            />
          ) : (
            <Segmented
              value={statusFilter ?? 'all'}
              onChange={(val) => onStatusFilterChange(val === 'all' ? undefined : val as StrategicProductStatus)}
              options={[
                { value: 'all', label: '全部' },
                { value: 'pending', label: '待确认' },
                { value: 'confirmed', label: '已确认' },
                { value: 'rejected', label: '已驳回' },
              ]}
            />
          )}
          <Button type="primary" onClick={onSearch} block={isMobile}>搜索</Button>
        </div>
        <div className={styles.toolbarRight}>
          <Button
            icon={<SyncOutlined />}
            onClick={onSyncCategory}
            loading={syncLoading}
            block={isMobile}
          >
            同步品类
          </Button>
          <Dropdown
            menu={{ items: batchMenuItems, onClick: handleBatchMenuClick }}
            disabled={selectedRowKeys.length === 0 && !selectAll}
          >
            <Button icon={<DownOutlined />} loading={batchLoading} block={isMobile}>
              批量操作 {selectAll ? (
                <Badge count={total} style={{ marginLeft: 6 }} />
              ) : selectedRowKeys.length > 0 && (
                <Badge count={selectedRowKeys.length} style={{ marginLeft: 6 }} />
              )}
            </Button>
          </Dropdown>
          <Button type="primary" icon={<PlusOutlined />} onClick={onAddClick} block={isMobile}>
            添加战略商品
          </Button>
        </div>
      </div>

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
