/**
 * 退货单表格组件
 */
import React from 'react';
import { Table, Tag, Button, Space, Tooltip } from 'antd';
import { EditOutlined, ShoppingOutlined } from '@ant-design/icons';
import type { ReturnOrder, ReturnOrderStatus } from '@/types/procurement-return';
import type { TablePaginationConfig } from 'antd';
import dayjs from 'dayjs';
import styles from '../index.less';

// 状态标签配置
const statusTagConfig: Record<ReturnOrderStatus, { color: string; text: string }> = {
  pending_confirm: { color: 'blue', text: '待确认' },
  pending_erp_fill: { color: 'red', text: '待填ERP' },
  pending_warehouse_execute: { color: 'orange', text: '待仓储退货' },
  pending_marketing_sale: { color: 'purple', text: '待营销销售' },
  completed: { color: 'green', text: '已完成' },
  cancelled: { color: 'default', text: '已取消' },
};

// 剩余保质期颜色配置
const getDaysToExpireTag = (days: number | null) => {
  if (days === null) return '-';
  
  let color = 'green';
  if (days <= 7) color = 'red';
  else if (days <= 15) color = 'orange';
  else if (days <= 30) color = 'gold';
  
  return <Tag color={color}>{days}天</Tag>;
};

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
}) => {
  const columns = [
    {
      title: '退货单号',
      dataIndex: 'sourceBillNo',
      key: 'sourceBillNo',
      width: 160,
      fixed: 'left' as const,
    },
    {
      title: '商品名称',
      dataIndex: 'goodsName',
      key: 'goodsName',
      width: 200,
      ellipsis: true,
    },
    {
      title: '数量',
      key: 'quantity',
      width: 100,
      render: (_: any, record: ReturnOrder) => (
        <span>{record.quantity} {record.unit || '件'}</span>
      ),
    },
    {
      title: '生产日期',
      dataIndex: 'batchDate',
      key: 'batchDate',
      width: 120,
      render: (date: string | null) => date ? dayjs(date).format('YYYY-MM-DD') : '-',
    },
    {
      title: '退货时间',
      dataIndex: 'returnDate',
      key: 'returnDate',
      width: 120,
      render: (date: string | null) => date ? dayjs(date).format('YYYY-MM-DD') : '-',
    },
    {
      title: '剩余保质期',
      dataIndex: 'daysToExpire',
      key: 'daysToExpire',
      width: 100,
      render: getDaysToExpireTag,
    },
    {
      title: '当前节点',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: ReturnOrderStatus) => {
        const config = statusTagConfig[status];
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '责任人',
      dataIndex: 'marketingManager',
      key: 'marketingManager',
      width: 100,
      render: (name: string | null) => name || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      fixed: 'right' as const,
      render: (_: any, record: ReturnOrder) => (
        <Space size="small">
          {record.status === 'pending_erp_fill' && (
            <Tooltip title="填写ERP">
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => onErpFill?.(record)}
              />
            </Tooltip>
          )}
          {record.status === 'pending_warehouse_execute' && (
            <Tooltip title="执行退货">
              <Button
                type="link"
                size="small"
                icon={<ShoppingOutlined />}
                onClick={() => onWarehouseExecute?.(record)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const handleTableChange = (paginationConfig: TablePaginationConfig) => {
    onPageChange(
      paginationConfig.current || 1,
      paginationConfig.pageSize || 10
    );
  };

  return (
    <Table
      className={styles.table}
      columns={columns}
      dataSource={dataSource}
      rowKey="id"
      loading={loading}
      scroll={{ x: 1200 }}
      rowSelection={{
        selectedRowKeys,
        onChange: (keys) => onSelectChange(keys as number[]),
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
