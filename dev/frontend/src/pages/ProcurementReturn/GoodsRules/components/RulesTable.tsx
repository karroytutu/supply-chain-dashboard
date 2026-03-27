/**
 * 商品退货规则表格组件
 */
import React from 'react';
import { Table, Tag, Button, Space } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { GoodsReturnRule } from '@/types/goods-return-rules';

interface RulesTableProps {
  dataSource: GoodsReturnRule[];
  loading: boolean;
  selectedRowKeys: number[];
  onSelectChange: (keys: number[]) => void;
  pagination: {
    current: number;
    pageSize: number;
    total: number;
  };
  onPageChange: (page: number, pageSize: number) => void;
  onAdjust: (record: GoodsReturnRule) => void;
}

const RulesTable: React.FC<RulesTableProps> = ({
  dataSource,
  loading,
  selectedRowKeys,
  onSelectChange,
  pagination,
  onPageChange,
  onAdjust,
}) => {
  const columns: ColumnsType<GoodsReturnRule> = [
    {
      title: '商品名称',
      dataIndex: 'goodsName',
      key: 'goodsName',
      width: 200,
      ellipsis: true,
    },
    {
      title: '商品ID',
      dataIndex: 'goodsId',
      key: 'goodsId',
      width: 120,
    },
    {
      title: '退货规则',
      dataIndex: 'canReturnToSupplier',
      key: 'canReturnToSupplier',
      width: 120,
      render: (canReturn: boolean) => (
        <Tag color={canReturn ? 'green' : 'red'}>
          {canReturn ? '✓ 可退货' : '✗ 不可退货'}
        </Tag>
      ),
    },
    {
      title: '确认人',
      dataIndex: 'confirmedByName',
      key: 'confirmedByName',
      width: 100,
      render: (name: string | undefined) => name || '-',
    },
    {
      title: '确认时间',
      dataIndex: 'confirmedAt',
      key: 'confirmedAt',
      width: 160,
      render: (time: string | null) => {
        if (!time) return '-';
        return new Date(time).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<SettingOutlined />}
            onClick={() => onAdjust(record)}
          >
            调整
          </Button>
        </Space>
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => onSelectChange(keys as number[]),
  };

  const handleTableChange = (paginationConfig: TablePaginationConfig) => {
    onPageChange(paginationConfig.current || 1, paginationConfig.pageSize || 10);
  };

  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={dataSource}
      loading={loading}
      rowSelection={rowSelection}
      pagination={{
        current: pagination.current,
        pageSize: pagination.pageSize,
        total: pagination.total,
        showSizeChanger: true,
        showQuickJumper: true,
        showTotal: (total) => `共 ${total} 条`,
      }}
      onChange={handleTableChange}
      scroll={{ x: 800 }}
    />
  );
};

export { RulesTable };
export default RulesTable;
