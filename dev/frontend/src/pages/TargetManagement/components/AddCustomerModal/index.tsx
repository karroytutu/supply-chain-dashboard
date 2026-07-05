/**
 * 添加计划开发客户弹窗
 * 表格形式展示客户，支持归属/公海筛选、片区树形筛选和关键词搜索
 */
import React, { useState } from 'react';
import { Modal, Input, Button, Table, TreeSelect, Segmented, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCustomerFilter, SCOPE_OPTIONS } from '../../hooks/useCustomerFilter';
import styles from './index.less';

interface AvailableCustomer {
  customerId: number;
  customerName: string;
  consumerManagerName: string | null;
  channelName: string | null;
  areaName: string;
  cooperationTypeName: string | null;
  isPublicSea: boolean;
}

interface AddCustomerModalProps {
  visible: boolean;
  loading?: boolean;
  onClose: () => void;
  onSuccess: (customers: Array<{ customerId: number; customerName: string }>) => void;
  availableCustomers: AvailableCustomer[];
  /** 当前营销师名下客户 ID 集合 */
  myCustomerIds: Set<number>;
}

const AddCustomerModal: React.FC<AddCustomerModalProps> = ({
  visible, loading, onClose, onSuccess, availableCustomers, myCustomerIds,
}) => {
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const filter = useCustomerFilter(availableCustomers, myCustomerIds);

  const resetState = () => { setSelectedRowKeys([]); filter.resetFilters(); };

  const handleOk = () => {
    const selectedIds = new Set(selectedRowKeys);
    onSuccess(availableCustomers.filter((c) => selectedIds.has(c.customerId)).map((c) => ({ customerId: c.customerId, customerName: c.customerName })));
    resetState();
  };

  const handleClose = () => { resetState(); onClose(); };

  const columns: ColumnsType<AvailableCustomer> = [
    { title: '客户名称', dataIndex: 'customerName', ellipsis: true },
    { title: '所属营销', dataIndex: 'consumerManagerName', width: 80, ellipsis: true, render: (v: string | null) => v || '-' },
    { title: '渠道', dataIndex: 'channelName', width: 100, ellipsis: true, render: (v: string | null) => v || '-' },
    { title: '片区', dataIndex: 'areaName', width: 150, ellipsis: true, render: (v: string) => v || '-' },
    { title: '合作深度', dataIndex: 'cooperationTypeName', width: 90, ellipsis: true, render: (v: string | null) => v || '-' },
  ];

  return (
    <Modal
      title="添加计划开发客户"
      open={visible}
      onCancel={handleClose}
      width={820}
      footer={[
        <Button key="cancel" onClick={handleClose}>取消</Button>,
        <Button key="ok" type="primary" disabled={selectedRowKeys.length === 0} onClick={handleOk}>
          确认添加 ({selectedRowKeys.length})
        </Button>,
      ]}
    >
      <div className={styles.filterArea}>
        <div className={styles.filterRow}>
          <Segmented
            options={SCOPE_OPTIONS}
            value={filter.scope}
            onChange={(v) => filter.setScope(v as typeof filter.scope)}
            size="small"
          />
          <Input.Search
            placeholder="搜索客户名称..."
            allowClear
            value={filter.keyword}
            onChange={(e) => filter.setKeyword(e.target.value)}
            size="small"
            style={{ flex: 1 }}
          />
        </div>
        <div className={styles.filterRow}>
          <TreeSelect
            placeholder="片区"
            allowClear
            treeCheckable
            showCheckedStrategy={TreeSelect.SHOW_ALL}
            maxTagCount="responsive"
            value={filter.areaFilters.length > 0 ? filter.areaFilters : undefined}
            onChange={(v) => filter.setAreaFilters(v || [])}
            treeData={filter.areaTreeOptions}
            treeDefaultExpandAll
            style={{ flex: 1 }}
            size="small"
          />
          <Select
            placeholder="渠道"
            allowClear
            mode="multiple"
            maxTagCount="responsive"
            value={filter.channelFilters.length > 0 ? filter.channelFilters : undefined}
            onChange={(v) => filter.setChannelFilters(v || [])}
            options={filter.channelOptions}
            style={{ width: 160 }}
            size="small"
          />
          <Select
            placeholder="合作深度"
            allowClear
            mode="multiple"
            maxTagCount="responsive"
            value={filter.coopFilters.length > 0 ? filter.coopFilters : undefined}
            onChange={(v) => filter.setCoopFilters(v || [])}
            options={filter.coopOptions}
            style={{ width: 140 }}
            size="small"
          />
          <span className={styles.countHint}>共 {filter.filtered.length} 条</span>
        </div>
      </div>
      <div className={styles.tableContainer}>
        <Table<AvailableCustomer>
          rowKey="customerId"
          columns={columns}
          dataSource={filter.filtered}
          size="small"
          pagination={false}
          virtual
          scroll={{ y: 320 }}
          loading={loading}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
            columnWidth: 40,
          }}
        />
      </div>
    </Modal>
  );
};

export default AddCustomerModal;
