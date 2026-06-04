/**
 * 战略商品表格工具栏
 */
import React from 'react';
import { Input, Button, Badge, Dropdown, Segmented, Select, type MenuProps } from 'antd';
import { SearchOutlined, PlusOutlined, DeleteOutlined, CheckOutlined, CloseOutlined, DownOutlined, SyncOutlined, DownloadOutlined } from '@ant-design/icons';
import type { StrategicProductStatus } from '@/types/strategic-product';
import { Authorized } from '@/components/Authorized';
import { PERMISSIONS } from '@/constants/permissions';
import styles from '../index.less';

interface StrategicProductToolbarProps {
  keyword: string;
  statusFilter?: StrategicProductStatus;
  isMobile: boolean;
  total: number;
  selectAll: boolean;
  selectedRowKeys: number[];
  syncLoading: boolean;
  exportLoading: boolean;
  batchLoading: boolean;
  onKeywordChange: (keyword: string) => void;
  onSearch: () => void;
  onStatusFilterChange: (status?: StrategicProductStatus) => void;
  onBatchConfirm: (action: 'confirm' | 'reject') => void;
  onBatchDelete: () => void;
  onAddClick: () => void;
  onSyncCategory: () => void;
  onExport: (type: 'all' | 'page' | 'selected') => void;
}

const StrategicProductToolbar: React.FC<StrategicProductToolbarProps> = ({
  keyword, statusFilter, isMobile, total, selectAll, selectedRowKeys,
  syncLoading, exportLoading, batchLoading,
  onKeywordChange, onSearch, onStatusFilterChange,
  onBatchConfirm, onBatchDelete, onAddClick, onSyncCategory, onExport,
}) => {
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

  const exportMenuItems: MenuProps['items'] = [
    { key: 'all', label: '导出全部数据' },
    { key: 'page', label: '导出本页数据' },
    { key: 'selected', label: '导出选中数据', disabled: selectedRowKeys.length === 0 && !selectAll },
  ];

  const handleExportMenuClick: MenuProps['onClick'] = ({ key }) => {
    if (key === 'all' || key === 'page' || key === 'selected') {
      onExport(key);
    }
  };

  const statusOptions = [
    { value: 'all', label: '全部' },
    { value: 'pending', label: '待确认' },
    { value: 'confirmed', label: '已确认' },
    { value: 'rejected', label: '已驳回' },
  ];

  return (
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
            options={statusOptions}
          />
        ) : (
          <Segmented
            value={statusFilter ?? 'all'}
            onChange={(val) => onStatusFilterChange(val === 'all' ? undefined : val as StrategicProductStatus)}
            options={statusOptions}
          />
        )}
        <Button type="primary" onClick={onSearch} block={isMobile}>搜索</Button>
      </div>
      <div className={styles.toolbarRight}>
        <Button icon={<SyncOutlined />} onClick={onSyncCategory} loading={syncLoading} block={isMobile}>
          同步品类
        </Button>
        <Authorized permission={PERMISSIONS.STRATEGIC.EXPORT}>
          <Dropdown menu={{ items: exportMenuItems, onClick: handleExportMenuClick }}>
            <Button icon={<DownloadOutlined />} loading={exportLoading} block={isMobile}>导出</Button>
          </Dropdown>
        </Authorized>
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
  );
};

export default StrategicProductToolbar;
