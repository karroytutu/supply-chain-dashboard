/**
 * 移动端欠款明细卡片
 * 紧凑两行布局：主信息行 + 次要信息行
 */
import React from 'react';
import { Checkbox, Dropdown, Tag } from 'antd';
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

/** 逾期天数颜色 */
const getOverdueColor = (days: number): string | undefined => {
  if (days > 30) return '#ff4d4f';
  if (days > 15) return '#faad14';
  return undefined;
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
      {/* Row 1: 选择框 + 单据号 | 金额 + 状态 + 操作 */}
      <div className={styles.row1}>
        <div className={styles.row1Left}>
          <Checkbox
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onSelect(detail.id)}
          />
          <span className={styles.billNo}>
            {detail.billNo || detail.erpBillId}
          </span>
        </div>
        <div className={styles.row1Right}>
          <span className={styles.amount}>
            ¥{(detail.leftAmount ?? 0).toLocaleString()}
          </span>
          <Tag color={statusCfg?.color}>{statusCfg?.label || detail.status}</Tag>
          {showActions && (
            <Dropdown
              menu={{
                items: actionMenuItems,
                onClick: ({ key }) => {
                  onAction(key as ModalType, detail);
                },
              }}
              trigger={['click']}
            >
              <span
                className={styles.actionBtn}
                onClick={(e) => e.stopPropagation()}
              >
                操作 <DownOutlined />
              </span>
            </Dropdown>
          )}
        </div>
      </div>

      {/* Row 2: 类型 · 到期日 · 逾期天数 */}
      <div className={styles.row2}>
        <span className={styles.secondaryText}>
          {detail.billTypeName || '-'}
        </span>
        <span className={styles.separator}>·</span>
        <span className={styles.secondaryText}>
          {formatDate(detail.expireTime)}到期
        </span>
        <span className={styles.separator}>·</span>
        <span
          className={styles.overdueText}
          style={{ color: getOverdueColor(detail.overdueDays) }}
        >
          {detail.overdueDays}天
        </span>
      </div>
    </div>
  );
};

export default DetailCard;
