/**
 * 移动端分页器组件
 */
import React from 'react';
import { Button } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import styles from '../index.less';

interface MobilePaginationProps {
  current: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

const MAX_VISIBLE_PAGES = 5;

const MobilePagination: React.FC<MobilePaginationProps> = ({ current, pageSize, total, onChange }) => {
  const totalPages = Math.ceil(total / pageSize);

  // 计算显示的页码范围
  const getPageRange = () => {
    if (totalPages <= MAX_VISIBLE_PAGES) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const half = Math.floor(MAX_VISIBLE_PAGES / 2);
    let start = Math.max(1, current - half);
    const end = Math.min(totalPages, start + MAX_VISIBLE_PAGES - 1);

    if (end - start < MAX_VISIBLE_PAGES - 1) {
      start = Math.max(1, end - MAX_VISIBLE_PAGES + 1);
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

export default MobilePagination;
