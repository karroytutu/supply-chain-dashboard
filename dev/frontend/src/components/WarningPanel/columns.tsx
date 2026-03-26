/**
 * WarningPanel 表格列配置
 */
import React from 'react';
import { Tag } from 'antd';
import { StarFilled } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { WarningProduct, StrategicLevel } from '@/types/warning';

/**
 * 战略等级渲染
 */
export const renderStrategicLevel = (level?: StrategicLevel) => {
  if (level === 'strategic') {
    return (
      <Tag color="gold" icon={<StarFilled />}>
        战略商品
      </Tag>
    );
  }
  return <Tag>普通商品</Tag>;
};

/**
 * 战略等级列配置
 */
export const strategicLevelColumn = {
  title: '战略等级',
  key: 'strategicLevel',
  width: 100,
  align: 'center' as const,
  render: (_: unknown, record: WarningProduct) => renderStrategicLevel(record.strategicLevel),
};

/**
 * 库存预警列配置
 */
export const getStockColumns = (): ColumnsType<WarningProduct> => [
  { title: '商品名称', dataIndex: 'productName', key: 'productName', width: 200, ellipsis: true },
  strategicLevelColumn,
  {
    title: '库存数量',
    dataIndex: ['stock', 'quantity'],
    key: 'stockQuantity',
    width: 100,
    align: 'right',
    render: (val: number, record: WarningProduct) => (
      <span style={{ fontWeight: 500 }}>{val.toLocaleString()}{record.stock.unitName ? ` ${record.stock.unitName}` : ''}</span>
    ),
  },
  {
    title: '日均销量',
    key: 'avgDailySales',
    width: 100,
    align: 'right',
    render: (_: unknown, record: WarningProduct) => {
      const sales = record.turnover.avgDailySales;
      const unit = record.stock.unitName || '';
      return <span style={{ fontWeight: 500 }}>{sales != null ? `${sales.toFixed(1)} ${unit}` : '-'}</span>;
    },
  },
  {
    title: '可售天数',
    key: 'sellableDays',
    width: 100,
    align: 'right',
    render: (_: unknown, record: WarningProduct) => {
      const days = record.turnover.days;
      const color = record.availability.status === 'out_of_stock' ? '#ff4d4f'
        : days <= 7 ? '#fa8c16'
        : days <= 15 ? '#fadb14'
        : '#52c41a';
      return (
        <span style={{ color, fontWeight: 500 }}>
          {record.availability.status === 'out_of_stock' ? '缺货' : `${days}天`}
        </span>
      );
    },
  },
];

/**
 * 库存积压列配置
 */
export const getTurnoverColumns = (): ColumnsType<WarningProduct> => [
  { title: '商品名称', dataIndex: 'productName', key: 'productName', width: 200, ellipsis: true },
  strategicLevelColumn,
  {
    title: '库存数量',
    dataIndex: ['stock', 'quantity'],
    key: 'stockQuantity',
    width: 100,
    align: 'right',
    render: (val: number, record: WarningProduct) => (
      <span style={{ fontWeight: 500 }}>{val.toLocaleString()}{record.stock.unitName ? ` ${record.stock.unitName}` : ''}</span>
    ),
  },
  {
    title: '库存金额',
    dataIndex: ['stock', 'costAmount'],
    key: 'stockCostAmount',
    width: 120,
    align: 'right',
    render: (val: number) => <span style={{ fontWeight: 500 }}>¥{val?.toLocaleString() ?? '-'}</span>,
  },
  {
    title: '日均销量',
    key: 'avgDailySales',
    width: 100,
    align: 'right',
    render: (_: unknown, record: WarningProduct) => {
      const sales = record.turnover.avgDailySales;
      const unit = record.stock.unitName || '';
      return <span style={{ fontWeight: 500 }}>{sales != null ? `${sales.toFixed(1)} ${unit}` : '-'}</span>;
    },
  },
  {
    title: '可售天数',
    key: 'sellableDays',
    width: 100,
    align: 'right',
    render: (_: unknown, record: WarningProduct) => {
      const days = record.turnover.days;
      const color = days > 90 ? '#ff4d4f' : days > 60 ? '#fa541c' : days > 30 ? '#faad14' : '#52c41a';
      return <span style={{ color, fontWeight: 500 }}>{days}天</span>;
    },
  },
];

/**
 * 临期预警列配置
 */
export const getExpiringColumns = (): ColumnsType<WarningProduct> => [
  { title: '商品名称', dataIndex: 'productName', key: 'productName', width: 280, ellipsis: true },
  strategicLevelColumn,
  {
    title: '库存数量', dataIndex: ['stock', 'quantity'], key: 'stockQuantity', width: 100, align: 'right',
    render: (val: number, record: WarningProduct) => (
      <span style={{ fontWeight: 500 }}>{val.toLocaleString()}{record.stock.unitName ? ` ${record.stock.unitName}` : ''}</span>
    ),
  },
  {
    title: '库存金额', dataIndex: ['stock', 'costAmount'], key: 'stockCostAmount', width: 120, align: 'right',
    render: (val: number) => <span style={{ fontWeight: 500 }}>¥{val?.toLocaleString() ?? '-'}</span>,
  },
  {
    title: '距到期天数', key: 'daysToExpiry', width: 100, align: 'right',
    render: (_: unknown, record: WarningProduct) => {
      const days = record.expiring.daysToExpiry ?? 0;
      const color = days <= 7 ? '#ff4d4f' : days <= 15 ? '#fa8c16' : days <= 30 ? '#faad14' : '#52c41a';
      return <span style={{ color, fontWeight: 500 }}>{days}天</span>;
    },
  },
];

/**
 * 滞销预警列配置
 */
export const getSlowMovingColumns = (): ColumnsType<WarningProduct> => [
  { title: '商品名称', dataIndex: 'productName', key: 'productName', width: 200, ellipsis: true },
  strategicLevelColumn,
  {
    title: '库存数量', dataIndex: ['stock', 'quantity'], key: 'stockQuantity', width: 100, align: 'right',
    render: (val: number, record: WarningProduct) => (
      <span style={{ fontWeight: 500 }}>{val.toLocaleString()}{record.stock.unitName ? ` ${record.stock.unitName}` : ''}</span>
    ),
  },
  {
    title: '库存金额', dataIndex: ['stock', 'costAmount'], key: 'stockCostAmount', width: 120, align: 'right',
    render: (val: number) => <span style={{ fontWeight: 500 }}>¥{val?.toLocaleString() ?? '-'}</span>,
  },
  {
    title: '未销售天数', key: 'daysWithoutSale', width: 100, align: 'right',
    render: (_: unknown, record: WarningProduct) => {
      const days = record.slowMoving?.daysWithoutSale ?? 0;
      const color = days > 30 ? '#ff4d4f' : days > 15 ? '#fa8c16' : '#faad14';
      return <span style={{ color, fontWeight: 500 }}>{days}天</span>;
    },
  },
];

/**
 * 根据选中类型获取列配置
 */
export const getColumns = (selectedKey: string | null): ColumnsType<WarningProduct> => {
  if (!selectedKey) return [];
  if (['outOfStock', 'lowStock'].includes(selectedKey)) return getStockColumns();
  if (['mildOverstock', 'moderateOverstock', 'seriousOverstock'].includes(selectedKey)) return getTurnoverColumns();
  if (['mildSlowMoving', 'moderateSlowMoving', 'seriousSlowMoving'].includes(selectedKey)) return getSlowMovingColumns();
  if (['expiring7Days', 'expiring15Days', 'expiring30Days'].includes(selectedKey)) return getExpiringColumns();
  return [];
};
