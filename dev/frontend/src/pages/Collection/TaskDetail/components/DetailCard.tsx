/**
 * 移动端欠款明细卡片
 * 用于详情页移动端展示欠款明细
 */
import React from 'react';
import { Checkbox, Dropdown, Button, Tag } from 'antd';
import { DownOutlined } from '@ant-design/icons';
import type { CollectionDetail, CollectionDetailStatus } from '@/types/ar-collection';
import type { ModalType } from '../hooks/useTaskDetail';
import styles from './DetailCard.less';

interface DetailCardProps {
  /** 明细数据 */
  detail: CollectionDetail;
  /** 是否选中 */
  selected: boolean;
  /** 是否显示操作按钮 */
  showActions: boolean;
  /** 选择回调 */
  onSelect: (id: number) => void;
  /** 操作回调 */
  onAction: (type: ModalType, detail: CollectionDetail) => void;
}

/** 明细状态映射 */
const DETAIL_STATUS: Record<CollectionDetailStatus, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'default' },
  pending_verify: { label: '待核销', color: 'cyan' },
  partial_verified: { label: '部分核销', color: 'blue' },
  full_verified: { label: '已核销', color: 'green' },
  extension: { label: '延期中', color: 'purple' },
  difference_pending: { label: '差异待处理', color: 'orange' },
  difference_resolved: { label: '差异已解决', color: 'green' },
  escalated: { label: '已升级', color: 'red' },
};

/** 格式化日期 */
const formatDate = (dateStr: string): string => {
  if (!dateStr) return '-';
  return dateStr.slice(0, 10);
};

const DetailCard: React.FC<DetailCardProps> = ({
  detail,
  selected,
  showActions,
  onSelect,
  onAction,
}) => {
  const actionMenuItems = [
    { key: 'verify', label: '核销回款' },
    { key: 'extension', label: '申请延期' },
    { key: 'difference', label: '标记差异' },
    { key: 'escalate', label: '升级处理' },
  ];

  const statusCfg = DETAIL_STATUS[detail.status];

  return (
    <div
      className={`${styles.detailCard} ${selected ? styles.selected : ''}`}
      onClick={() => onSelect(detail.id)}
    >
      {/* 头部：选择框 + 单据号 + 状态 */}
      <div className={styles.cardHeader}>
        <div className={styles.headerLeft}>
          <Checkbox
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onSelect(detail.id)}
          />
          <span className={styles.billNo}>
            {detail.billNo || detail.erpBillId}
          </span>
        </div>
        <Tag color={statusCfg?.color}>{statusCfg?.label || detail.status}</Tag>
      </div>

      {/* 主体：类型、金额、到期日、逾期天数 */}
      <div className={styles.cardBody}>
        <div className={styles.infoRow}>
          <span className={styles.label}>类型</span>
          <span className={styles.value}>{detail.billTypeName || '-'}</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.label}>金额</span>
          <span className={styles.amountValue}>
            ¥{(detail.leftAmount ?? 0).toLocaleString()}
          </span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.label}>到期日</span>
          <span className={styles.value}>{formatDate(detail.expireTime)}</span>
        </div>
        <div className={styles.infoRow}>
          <span className={styles.label}>逾期</span>
          <span
            className={styles.overdueValue}
            style={{
              color:
                detail.overdueDays > 30
                  ? '#ff4d4f'
                  : detail.overdueDays > 15
                    ? '#faad14'
                    : undefined,
            }}
          >
            {detail.overdueDays}天
          </span>
        </div>
      </div>

      {/* 底部：操作按钮 */}
      {showActions && (
        <div className={styles.cardFooter}>
          <Dropdown
            menu={{
              items: actionMenuItems,
              onClick: ({ key }) => {
                onAction(key as ModalType, detail);
              },
            }}
            trigger={['click']}
          >
            <Button type="link" size="small" onClick={(e) => e.stopPropagation()}>
              操作 <DownOutlined />
            </Button>
          </Dropdown>
        </div>
      )}
    </div>
  );
};

export default DetailCard;
