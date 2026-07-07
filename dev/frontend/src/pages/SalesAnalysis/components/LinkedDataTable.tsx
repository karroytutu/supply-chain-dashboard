/**
 * 联动明细表通用组件
 * 支持搜索、列排序、分页、联动筛选
 * 客户分析和商品分析复用
 */
import React, { useState, useMemo } from 'react';
import { Table, Input, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useMobileDetect } from '@/hooks/useMobileDetect';
import styles from './LinkedDataTable.less';

/** eslint-disable-next-line @typescript-eslint/no-explicit-any */
type AnyRecord = Record<string, any>;

export interface LinkedColumn {
  key: string;
  title: string;
  dataIndex: string;
  /** 桌面端是否显示，默认 true */
  desktopVisible?: boolean;
  /** 移动端是否显示，默认跟随 desktopVisible */
  mobileVisible?: boolean;
  /** 是否支持排序 */
  sortable?: boolean;
  /** 列宽 */
  width?: number;
  /** 对齐方式 */
  align?: 'left' | 'center' | 'right';
  /** 自定义渲染 */
  render?: (value: any, record: any) => React.ReactNode;
}

interface LinkedDataTableProps {
  /** 列配置 */
  columns: LinkedColumn[];
  /** 数据源 */
  dataSource: AnyRecord[];
  /** 行唯一标识字段 */
  rowKey: string;
  /** 联动筛选状态 */
  filterState?: { label: string; filterFn: (record: AnyRecord) => boolean } | null;
  /** 清除筛选回调 */
  onClearFilter?: () => void;
  /** 搜索占位文案 */
  searchPlaceholder?: string;
  /** 搜索匹配的字段 */
  searchFields: string[];
  /** 每页条数 */
  pageSize?: number;
}

const LinkedDataTable: React.FC<LinkedDataTableProps> = ({
  columns,
  dataSource,
  rowKey,
  filterState,
  onClearFilter,
  searchPlaceholder = '搜索...',
  searchFields,
  pageSize = 20,
}) => {
  const isMobile = useMobileDetect();
  const [keyword, setKeyword] = useState('');

  const filteredData = useMemo(() => {
    let data = dataSource;
    if (filterState?.filterFn) {
      data = data.filter(filterState.filterFn);
    }
    if (keyword) {
      const kw = keyword.toLowerCase();
      data = data.filter((row) =>
        searchFields.some((field) => {
          const val = row[field];
          return typeof val === 'string' && val.toLowerCase().includes(kw);
        }),
      );
    }
    return data;
  }, [dataSource, filterState, keyword, searchFields]);

  const visibleColumns: ColumnsType<AnyRecord> = useMemo(() => {
    return columns
      .filter((col) => (isMobile ? col.mobileVisible !== false : col.desktopVisible !== false))
      .map((col) => ({
        title: col.title,
        dataIndex: col.dataIndex,
        key: col.key,
        width: col.width,
        align: col.align,
        sorter: col.sortable
          ? (a: AnyRecord, b: AnyRecord) => (Number(a[col.dataIndex]) || 0) - (Number(b[col.dataIndex]) || 0)
          : undefined,
        render: col.render as ColumnsType<AnyRecord>[0]['render'],
      }));
  }, [columns, isMobile]);

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <Input
          placeholder={searchPlaceholder}
          prefix={<SearchOutlined />}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          allowClear
          className={styles.searchInput}
        />
        {filterState && (
          <Tag closable onClose={onClearFilter} color="blue" className={styles.filterTag}>
            {filterState.label}
          </Tag>
        )}
      </div>
      <Table
        columns={visibleColumns}
        dataSource={filteredData}
        rowKey={rowKey}
        pagination={{ pageSize, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }}
        size="small"
        scroll={isMobile ? { x: 600 } : undefined}
        className={styles.table}
      />
    </div>
  );
};

export default LinkedDataTable;
