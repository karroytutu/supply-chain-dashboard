/**
 * 移动端退货单卡片组件
 * 支持展开/收起详情
 */
import React, { useState } from 'react';
import { Button, Tag } from 'antd';
import { EditOutlined, ShoppingOutlined, RollbackOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import type { ReturnOrder, ReturnOrderStatus } from '@/types/procurement-return';
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

// 格式化日期
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  return dateStr.split('T')[0]; // 只取日期部分
};

interface ReturnOrderCardProps {
  record: ReturnOrder;
  onErpFill?: (record: ReturnOrder) => void;
  onWarehouseExecute?: (record: ReturnOrder) => void;
  onRollback?: (record: ReturnOrder) => void;
}

const ReturnOrderCard: React.FC<ReturnOrderCardProps> = ({
  record,
  onErpFill,
  onWarehouseExecute,
  onRollback,
}) => {
  const [expanded, setExpanded] = useState(false);
  const statusConfig = statusTagConfig[record.status];

  return (
    <div className={styles.mobileCard}>
      {/* 卡片头部：商品名称 + 退货单号 + 状态 */}
      <div className={styles.mobileCardHeader}>
        <div className={styles.mobileCardHeaderLeft}>
          <div className={styles.mobileCardTitle} title={record.goodsName}>
            {record.goodsName}
          </div>
          <div className={styles.mobileCardSubtitle}>
            退货单号：{record.sourceBillNo || '-'}
          </div>
        </div>
        <Tag color={statusConfig.color} className={styles.mobileCardStatus}>
          {statusConfig.text}
        </Tag>
      </div>

      {/* 卡片主体：关键信息网格 */}
      <div className={styles.mobileCardBody}>
        <div className={styles.mobileCardGrid}>
          <div className={styles.mobileCardGridItem}>
            <span className={styles.mobileCardLabel}>退货数量</span>
            <span className={styles.mobileCardValue}>
              {record.quantity} {record.unit || '件'}
            </span>
          </div>
          <div className={styles.mobileCardGridItem}>
            <span className={styles.mobileCardLabel}>当前库存</span>
            <span className={styles.mobileCardValue}>
              {record.currentStock === null || record.currentStock === undefined
                ? '-'
                : record.currentStock === 0
                  ? <span style={{ color: '#52c41a' }}>已清零</span>
                  : `${record.currentStock} ${record.unit || '件'}`}
            </span>
          </div>
          <div className={styles.mobileCardGridItem}>
            <span className={styles.mobileCardLabel}>退货时间</span>
            <span className={styles.mobileCardValue}>{formatDate(record.returnDate)}</span>
          </div>
          <div className={styles.mobileCardGridItem}>
            <span className={styles.mobileCardLabel}>剩余保质期</span>
            <span className={styles.mobileCardValue}>{getDaysToExpireTag(record.daysToExpire)}</span>
          </div>
        </div>
      </div>

      {/* 展开详情区域 */}
      {expanded && (
        <div className={styles.mobileCardDetail}>
          <div className={styles.mobileCardDetailRow}>
            <span className={styles.mobileCardLabel}>生产日期</span>
            <span className={styles.mobileCardValue}>{formatDate(record.batchDate)}</span>
          </div>
          <div className={styles.mobileCardDetailRow}>
            <span className={styles.mobileCardLabel}>到期日期</span>
            <span className={styles.mobileCardValue}>{formatDate(record.expireDate)}</span>
          </div>
          <div className={styles.mobileCardDetailRow}>
            <span className={styles.mobileCardLabel}>退货时保质期</span>
            <span className={styles.mobileCardValue}>{getDaysToExpireTag(record.daysToExpireAtReturn)}</span>
          </div>
          {record.erpReturnNo && (
            <div className={styles.mobileCardDetailRow}>
              <span className={styles.mobileCardLabel}>ERP退货单号</span>
              <span className={styles.mobileCardValue}>{record.erpReturnNo}</span>
            </div>
          )}
          {record.erpFillerName && (
            <div className={styles.mobileCardDetailRow}>
              <span className={styles.mobileCardLabel}>ERP填写人</span>
              <span className={styles.mobileCardValue}>{record.erpFillerName}</span>
            </div>
          )}
          {record.warehouseExecutorName && (
            <div className={styles.mobileCardDetailRow}>
              <span className={styles.mobileCardLabel}>仓储执行人</span>
              <span className={styles.mobileCardValue}>{record.warehouseExecutorName}</span>
            </div>
          )}
          {record.consumerName && (
            <div className={styles.mobileCardDetailRow}>
              <span className={styles.mobileCardLabel}>消费者</span>
              <span className={styles.mobileCardValue}>{record.consumerName}</span>
            </div>
          )}
        </div>
      )}

      {/* 展开按钮 */}
      <div className={styles.mobileCardExpand} onClick={() => setExpanded(!expanded)}>
        {expanded ? (
          <>
            收起详情 <UpOutlined style={{ fontSize: 10 }} />
          </>
        ) : (
          <>
            展开详情 <DownOutlined style={{ fontSize: 10 }} />
          </>
        )}
      </div>

      {/* 操作按钮 */}
      <div className={styles.mobileCardActions}>
        {record.status === 'pending_erp_fill' && (
          <>
            <Button
              type="primary"
              icon={<EditOutlined />}
              onClick={() => onErpFill?.(record)}
              className={styles.mobileActionButton}
            >
              填写ERP
            </Button>
            <Button
              danger
              icon={<RollbackOutlined />}
              onClick={() => onRollback?.(record)}
              className={styles.mobileActionButton}
            >
              回退
            </Button>
          </>
        )}
        {record.status === 'pending_warehouse_execute' && (
          <Button
            type="primary"
            icon={<ShoppingOutlined />}
            onClick={() => onWarehouseExecute?.(record)}
            className={styles.mobileActionButtonFull}
          >
            执行退货
          </Button>
        )}
        {record.status === 'pending_marketing_sale' && (
          <Button
            danger
            icon={<RollbackOutlined />}
            onClick={() => onRollback?.(record)}
            className={styles.mobileActionButtonFull}
          >
            回退
          </Button>
        )}
      </div>
    </div>
  );
};

export { ReturnOrderCard, statusTagConfig, getDaysToExpireTag };
export default ReturnOrderCard;
