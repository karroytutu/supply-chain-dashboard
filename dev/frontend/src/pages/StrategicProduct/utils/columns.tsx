/**
 * 战略商品表格列配置
 */
import React from 'react';
import { Tag, Space, Button, Tooltip, Popconfirm } from 'antd';
import { CheckOutlined, CloseOutlined, DeleteOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { StrategicProduct, StrategicProductStatus } from '@/types/strategic-product';

/**
 * 状态标签渲染
 */
export const renderStatusTag = (status: StrategicProductStatus) => {
  const config: Record<StrategicProductStatus, { color: string; text: string }> = {
    pending: { color: 'warning', text: '待确认' },
    confirmed: { color: 'success', text: '已确认' },
    rejected: { color: 'error', text: '已驳回' },
  };
  const { color, text } = config[status];
  return <Tag color={color}>{text}</Tag>;
};

/**
 * 确认状态渲染
 */
export const renderConfirmStatus = (record: StrategicProduct) => {
  const procurementStatus = record.procurementConfirmed ? '已确认' : '待确认';
  const marketingStatus = record.marketingConfirmed ? '已确认' : '待确认';
  
  return (
    <Space size={8}>
      <Tooltip title={`采购主管：${procurementStatus}`}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>采</span>
          {record.procurementConfirmed ? (
            <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 14 }} />
          ) : (
            <ClockCircleOutlined style={{ color: '#d9d9d9', fontSize: 14 }} />
          )}
        </span>
      </Tooltip>
      <Tooltip title={`营销主管：${marketingStatus}`}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: 12, color: '#8c8c8c' }}>营</span>
          {record.marketingConfirmed ? (
            <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 14 }} />
          ) : (
            <ClockCircleOutlined style={{ color: '#d9d9d9', fontSize: 14 }} />
          )}
        </span>
      </Tooltip>
    </Space>
  );
};

/**
 * 获取表格列配置
 */
export const getColumns = (
  onConfirm: (record: StrategicProduct, confirmed: boolean) => void,
  onDelete: (id: number) => void
): ColumnsType<StrategicProduct> => [
  {
    title: '商品名称',
    dataIndex: 'goodsName',
    key: 'goodsName',
    ellipsis: true,
  },
  {
    title: '确认状态',
    key: 'confirmStatus',
    width: 90,
    align: 'center' as const,
    render: renderConfirmStatus,
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 90,
    render: renderStatusTag,
  },
  {
    title: '提交时间',
    dataIndex: 'createdAt',
    key: 'createdAt',
    width: 170,
    render: (text: string) => text ? new Date(text).toLocaleString() : '-',
  },
  {
    title: '确认时间',
    dataIndex: 'confirmedAt',
    key: 'confirmedAt',
    width: 170,
    render: (text: string) => text ? new Date(text).toLocaleString() : '-',
  },
  {
    title: '操作',
    key: 'action',
    width: 120,
    fixed: 'right' as const,
    render: (_: unknown, record: StrategicProduct) => (
      <Space>
        {record.status === 'pending' && (
          <>
            <Tooltip title="确认">
              <Button
                type="link"
                size="small"
                icon={<CheckOutlined />}
                onClick={() => onConfirm(record, true)}
              />
            </Tooltip>
            <Tooltip title="驳回">
              <Button
                type="link"
                size="small"
                danger
                icon={<CloseOutlined />}
                onClick={() => onConfirm(record, false)}
              />
            </Tooltip>
          </>
        )}
        <Popconfirm
          title="确定要删除该战略商品吗？"
          onConfirm={() => onDelete(record.id)}
          okText="确定"
          cancelText="取消"
        >
          <Button type="link" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    ),
  },
];
