/**
 * 只读表格组件
 * 从 FormFieldRenderer 中提取，解决 React Hooks 规则违反问题
 * （useContainerWidth 不能在条件分支中调用）
 */
import React from 'react';
import { Table, Tooltip } from 'antd';
import type { FormField } from '@/types/oa';
import type { ErpResolvedMap } from './hooks/useErpFieldResolve';
import { renderCellValue } from './cellValueRenderer';
import { useContainerWidth, getColumnWidth, NUMERIC_ALIGN_TYPES, ELLIPSIS_TYPES } from './hooks/useContainerWidth';
import styles from './FormFieldRenderer.less';

interface ReadonlyTableProps {
  field: FormField;
  rows: Record<string, unknown>[];
  resolvedMap?: ErpResolvedMap;
}

const ReadonlyTable: React.FC<ReadonlyTableProps> = ({ field, rows, resolvedMap }) => {
  const [containerRef, containerWidth] = useContainerWidth();
  const children = field.children || [];
  const minColumnWidthsSum = children.reduce((sum, col) => sum + getColumnWidth(col), 0);
  const fixFirstCol = children.length >= 5;

  const tableColumns = children.map((col, idx) => {
    const isNumeric = NUMERIC_ALIGN_TYPES.has(col.type);
    const isEllipsis = ELLIPSIS_TYPES.has(col.type);
    return {
      title: col.label,
      dataIndex: col.key,
      key: col.key,
      width: getColumnWidth(col),
      ...(fixFirstCol && idx === 0 ? { fixed: 'left' as const } : {}),
      ...(isNumeric ? { align: 'right' as const } : {}),
      ...(isEllipsis ? { ellipsis: { showTitle: false } } : {}),
      render: (cellVal: unknown, row: Record<string, unknown>) => {
        const content = renderCellValue(col, cellVal, row, resolvedMap);
        if (isEllipsis && cellVal !== null && cellVal !== undefined && cellVal !== '') {
          return (
            <Tooltip title={String(cellVal)} placement="topLeft">
              <span>{content}</span>
            </Tooltip>
          );
        }
        return content;
      },
    };
  });

  return (
    <div ref={containerRef} className={styles.readonlyTableWrapper}>
      <Table
        columns={tableColumns}
        dataSource={rows.map((row, idx) => ({ ...row, _key: idx }))}
        rowKey="_key"
        size="small"
        pagination={false}
        bordered
        scroll={{ x: Math.max(containerWidth, minColumnWidthsSum) }}
      />
    </div>
  );
};

export default ReadonlyTable;
