import React from 'react';
import { Input, Button, List, Spin, Empty, Tag } from 'antd';
import { SearchOutlined, FilterOutlined } from '@ant-design/icons';
import type { ApprovalInstance } from '@/types/oa-approval';
import { URGENCY_LABELS, URGENCY_COLORS } from '@/types/oa-approval';
import styles from '../index.less';

interface ApprovalListProps {
  loading: boolean;
  list: ApprovalInstance[];
  total: number;
  page: number;
  searchText: string;
  selectedId: number | null;
  onSearchTextChange: (text: string) => void;
  onItemClick: (item: ApprovalInstance) => void;
  onPageChange: (page: number) => void;
}

/** 渲染紧急程度标签 */
const renderUrgencyTag = (urgency: string) => {
  if (urgency === 'normal') return null;
  return (
    <Tag color={URGENCY_COLORS[urgency as keyof typeof URGENCY_COLORS]}>
      {URGENCY_LABELS[urgency as keyof typeof URGENCY_LABELS]}
    </Tag>
  );
};

const ApprovalList: React.FC<ApprovalListProps> = ({
  loading, list, total, page, searchText, selectedId,
  onSearchTextChange, onItemClick, onPageChange,
}) => {
  return (
    <div className={styles.listPanel}>
      <div className={styles.listHeader}>
        <Input
          className={styles.searchInput}
          placeholder="搜索审批单..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => onSearchTextChange(e.target.value)}
          allowClear
        />
        <Button icon={<FilterOutlined />}>筛选</Button>
      </div>

      <div className={styles.listContent}>
        {loading ? (
          <div className={styles.loadingContainer}><Spin /></div>
        ) : list.length === 0 ? (
          <Empty description="暂无数据" />
        ) : (
          <List
            dataSource={list}
            renderItem={(item) => (
              <div
                className={`${styles.listItem} ${selectedId === item.id ? styles.listItemActive : ''}`}
                onClick={() => onItemClick(item)}
              >
                <div className={styles.itemHeader}>
                  <span className={styles.itemTitle}>{item.title}</span>
                  <span className={styles.itemDate}>
                    {new Date(item.submittedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className={styles.itemInfo}>
                  <span className={styles.itemApplicant}>{item.applicantName}</span>
                  <span className={styles.itemType}>{item.formTypeName}</span>
                </div>
                <div className={styles.itemFooter}>
                  <Tag color="orange">等待 {item.currentNodeName || '处理'}</Tag>
                  {renderUrgencyTag(item.urgency)}
                </div>
              </div>
            )}
          />
        )}
      </div>

      {total > 20 && (
        <div className={styles.listFooter}>
          <Button onClick={() => onPageChange(page - 1)} disabled={page === 1}>
            上一页
          </Button>
          <span>{page} / {Math.ceil(total / 20)}</span>
          <Button onClick={() => onPageChange(page + 1)} disabled={page >= Math.ceil(total / 20)}>
            下一页
          </Button>
        </div>
      )}
    </div>
  );
};

export default ApprovalList;
