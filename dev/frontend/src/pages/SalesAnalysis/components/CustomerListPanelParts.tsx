/**
 * 客户列表面板 - 子组件
 * Toolbar（筛选/搜索/负责人）和 MyViewSummary（我的视图概要）
 */

import React, { useRef, useEffect, useState } from 'react';
import { Input, Select } from 'antd';
import type { DrilldownRiskGroup, DrilldownMyView } from '@/types/sales-analysis';
import { useMobileDetect } from '@/hooks/useMobileDetect';
import styles from './CustomerListPanel.less';

/** 工具栏：筛选标签 + 搜索 + 负责人，合并为一行 */
export const Toolbar: React.FC<{
  filters: DrilldownRiskGroup['filters'];
  filterKey: string;
  keyword: string;
  ownerFilter: string;
  ownerOptions: string[];
  onFilterChange: (key: string) => void;
  onKeywordChange: (keyword: string) => void;
  onOwnerFilterChange: (owner: string) => void;
}> = ({ filters, filterKey, keyword, ownerFilter, ownerOptions, onFilterChange, onKeywordChange, onOwnerFilterChange }) => {
  const [inputValue, setInputValue] = useState(keyword);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const isMobile = useMobileDetect();

  useEffect(() => {
    timerRef.current = setTimeout(() => onKeywordChange(inputValue), 300);
    return () => clearTimeout(timerRef.current);
  }, [inputValue, onKeywordChange]);

  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarRow}>
        {filters.length > 1 && (
          <div className={styles.filterSelect}>
            <Select
              placeholder="状态"
              value={filterKey}
              onChange={(val) => onFilterChange(val)}
              size="small"
              style={{ width: '100%', minWidth: 0 }}
              options={filters.map((f) => ({ value: f.key, label: f.label }))}
            />
          </div>
        )}
        <div className={styles.filterSearch}>
          <Input.Search
            placeholder="搜索客户名称"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            allowClear
            size="small"
            style={{ width: '100%' }}
          />
        </div>
        <div className={styles.ownerSelect}>
          <Select
            placeholder="负责人"
            value={ownerFilter || undefined}
            onChange={(val) => onOwnerFilterChange(val || '')}
            allowClear
            size="small"
            style={{ width: '100%', minWidth: 0 }}
            options={ownerOptions.map((o) => ({ value: o, label: o }))}
          />
        </div>
      </div>
    </div>
  );
};

/** 我的视图概要 */
export const MyViewSummary: React.FC<{ myView: DrilldownMyView }> = ({ myView }) => (
  <div className={styles.myViewSummary}>
    <div>
      <div className={styles.myViewKicker}>业务员视角</div>
      <h4 className={styles.myViewTitle}>{myView.title}</h4>
      <p className={styles.myViewNote}>{myView.note}</p>
    </div>
    <div className={styles.myViewFocus}>
      <div className={styles.myViewFocusTop}>
        <span className={styles.myViewFocusLabel}>{myView.focusLabel}</span>
        <span className={styles.myViewFocusStatus}>{myView.focusStatus}</span>
      </div>
      <div className={styles.myViewFocusName}>{myView.focusName}</div>
      <p className={styles.myViewFocusNote}>{myView.focusNote}</p>
    </div>
  </div>
);
