/**
 * 退货单表格列配置和状态渲染工具
 */
import React from 'react';
import { Tag, Button, Space, Tooltip } from 'antd';
import { EditOutlined, ShoppingOutlined, RollbackOutlined } from '@ant-design/icons';
import type { ReturnOrder, ReturnOrderStatus } from '@/types/procurement-return';

/** 状态标签配置 */
export const statusTagConfig: Record<ReturnOrderStatus, { color: string; text: string }> = {
  pending_confirm: { color: 'blue', text: '待确认' },
  pending_erp_fill: { color: 'red', text: '待填ERP' },
  pending_warehouse_execute: { color: 'orange', text: '待仓储退货' },
  pending_marketing_sale: { color: 'purple', text: '待营销销售' },
  completed: { color: 'green', text: '已完成' },
  cancelled: { color: 'default', text: '已取消' },
};

/** 剩余保质期颜色渲染 */
export const getDaysToExpireTag = (days: number | null) => {
  if (days === null) return '-';

  if (days < 0) {
    return <Tag color="red">过期{-days}天</Tag>;
  }

  let color = 'green';
  if (days <= 7) color = 'red';
  else if (days <= 15) color = 'orange';
  else if (days <= 30) color = 'gold';

  return <Tag color={color}>{days}天</Tag>;
};

/** 获取退货单表格列配置 */
export function getReturnOrderColumns(handlers: {
  onErpFill?: (record: ReturnOrder) => void;
  onWarehouseExecute?: (record: ReturnOrder) => void;
  onRollback?: (record: ReturnOrder) => void;
}) {
  const { onErpFill, onWarehouseExecute, onRollback } = handlers;

  return [
    {
      title: '退货单号',
      dataIndex: 'sourceBillNo',
      key: 'sourceBillNo',
      width: 180,
      fixed: 'left' as const,
    },
    {
      title: '商品名称',
      dataIndex: 'goodsName',
      key: 'goodsName',
      ellipsis: true,
    },
    {
      title: '客户',
      dataIndex: 'consumerName',
      key: 'consumerName',
      width: 120,
      render: (val: string | null) => val || '-',
    },
    {
      title: '数量',
      key: 'quantity',
      width: 80,
      render: (_: unknown, record: ReturnOrder) => (
        <span>{record.quantity} {record.unit || '件'}</span>
      ),
    },
    {
      title: '当前库存',
      key: 'currentStock',
      width: 90,
      render: (_: unknown, record: ReturnOrder) => {
        if (record.currentStockDisplay) {
          return <span>{record.currentStockDisplay}</span>;
        }
        const stock = record.currentStock;
        if (stock === null || stock === undefined) {
          return <span style={{ color: '#999' }}>-</span>;
        }
        if (stock === 0) {
          return <span style={{ color: '#52c41a' }}>已清零</span>;
        }
        return <span>{stock} {record.currentStockUnit || record.unit || '件'}</span>;
      },
    },
    {
      title: '当前剩余保质期',
      dataIndex: 'daysToExpire',
      key: 'daysToExpire',
      width: 110,
      render: getDaysToExpireTag,
    },
    {
      title: '当前节点',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: ReturnOrderStatus) => {
        const config = statusTagConfig[status];
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: unknown, record: ReturnOrder) => (
        <Space size="small">
          {record.status === 'pending_erp_fill' && (
            <>
              <Tooltip title="填写ERP">
                <Button type="link" size="small" icon={<EditOutlined />} onClick={() => onErpFill?.(record)} />
              </Tooltip>
              <Tooltip title="回退">
                <Button type="link" size="small" danger icon={<RollbackOutlined />} onClick={() => onRollback?.(record)} />
              </Tooltip>
            </>
          )}
          {record.status === 'pending_warehouse_execute' && (
            <Tooltip title="执行退货">
              <Button type="link" size="small" icon={<ShoppingOutlined />} onClick={() => onWarehouseExecute?.(record)} />
            </Tooltip>
          )}
          {record.status === 'pending_marketing_sale' && (
            <Tooltip title="回退">
              <Button type="link" size="small" danger icon={<RollbackOutlined />} onClick={() => onRollback?.(record)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];
}
