/**
 * 退货单表格组件
 * 支持桌面端表格和移动端卡片列表
 */
import React from 'react';
import { Table, Tag, Button, Space, Tooltip, Empty, type TablePaginationConfig } from 'antd';
import { EditOutlined, ShoppingOutlined, RollbackOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import type { ReturnOrder, ReturnOrderStatus } from '@/types/procurement-return';
import { useMobileDetect } from '../hooks/useMobileDetect';
import { ExpandedDetail } from './ExpandedDetail';
import { ReturnOrderCard } from './ReturnOrderCard';
import { MobileSkeleton } from './MobileSkeleton';
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

  if (days < 0) {
    return <Tag color="red">过期{-days}天</Tag>;
  }

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
  onRollback?: (record: ReturnOrder) => void;
}

// 移动端分页器组件
const MobilePagination: React.FC<{
  current: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}> = ({ current, pageSize, total, onChange }) => {
  const totalPages = Math.ceil(total / pageSize);
  const maxVisiblePages = 5;
  
  // 计算显示的页码范围
  const getPageRange = () => {
    if (totalPages <= maxVisiblePages) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    
    const half = Math.floor(maxVisiblePages / 2);
    let start = Math.max(1, current - half);
    const end = Math.min(totalPages, start + maxVisiblePages - 1);
    
    if (end - start < maxVisiblePages - 1) {
      start = Math.max(1, end - maxVisiblePages + 1);
    }
    
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  };
  
  return (
    <div className={styles.mobilePaginationWrapper}>
      <div className={styles.mobilePaginationInfo}>
        共 {total} 条 · 第 {current}/{totalPages} 页
      </div>
      
      <div className={styles.mobilePaginationButtons}>
        <Button
          className={styles.mobilePageButton}
          disabled={current <= 1}
          onClick={() => onChange(current - 1)}
          icon={<LeftOutlined />}
        >
          上一页
        </Button>
        
        <div className={styles.mobilePageIndicators}>
          {getPageRange().map((page) => (
            <span
              key={page}
              className={`${styles.mobilePageDot} ${page === current ? styles.mobilePageDotActive : ''}`}
              onClick={() => onChange(page)}
            >
              {page === current ? page : '·'}
            </span>
          ))}
        </div>
        
        <Button
          className={styles.mobilePageButton}
          disabled={current >= totalPages}
          onClick={() => onChange(current + 1)}
        >
          下一页
          <RightOutlined />
        </Button>
      </div>
    </div>
  );
};

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

  // 精简后的列配置（7列）
  const columns = [
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
        // 优先使用后端计算好的显示文本
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
        // 使用库存单位而非退货单单位
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
                <Button
                  type="link"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => onErpFill?.(record)}
                />
              </Tooltip>
              <Tooltip title="回退">
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<RollbackOutlined />}
                  onClick={() => onRollback?.(record)}
                />
              </Tooltip>
            </>
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
          {record.status === 'pending_marketing_sale' && (
            <Tooltip title="回退">
              <Button
                type="link"
                size="small"
                danger
                icon={<RollbackOutlined />}
                onClick={() => onRollback?.(record)}
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

  // 移动端渲染卡片列表
  if (isMobile) {
    return (
      <div className={styles.mobileCardList}>
        {/* 加载骨架屏 */}
        {loading && <MobileSkeleton count={3} />}
        
        {/* 数据列表 */}
        {!loading && dataSource.length > 0 && dataSource.map(record => (
          <ReturnOrderCard
            key={record.id}
            record={record}
            onErpFill={onErpFill}
            onWarehouseExecute={onWarehouseExecute}
            onRollback={onRollback}
          />
        ))}
        
        {/* 空状态 */}
        {!loading && dataSource.length === 0 && (
          <div className={styles.emptyState}>
            <Empty
              description="暂无退货单数据"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          </div>
        )}
        
        {/* 移动端分页 */}
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
      scroll={{ x: 920 }}
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
