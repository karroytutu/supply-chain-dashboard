/**
 * 只读表格组件
 * 供 OA 审批详情页等场景展示 table 类型字段
 * 所有设备统一使用 Ant Design Table，移动端通过 CSS 媒体查询优化紧凑度和横滚体验
 */
import React from 'react';
import { Table } from 'antd';
import type { FormField } from '@/types/oa';
import type { ErpResolvedMap } from './hooks/useErpFieldResolve';
import { renderCellValue } from './cellValueRenderer';
import { NUMERIC_ALIGN_TYPES } from './hooks/useContainerWidth';
import styles from './FormFieldRenderer.less';

interface ReadonlyTableProps {
  field: FormField;
  rows: Record<string, unknown>[];
  resolvedMap?: ErpResolvedMap;
}

const ReadonlyTable: React.FC<ReadonlyTableProps> = ({ field, rows, resolvedMap }) => {
  const children = field.children || [];
  const fixFirstCol = children.length >= 4;

  // 检查是否需要汇总行：存在 formula 子字段或 statField 配置
  const formulaChildren = children.filter(c => c.type === 'formula' && c.formula);
  const statFieldKeys = (field.statField || []).map(s => s.componentId);
  const summaryKeys = new Set([
    ...formulaChildren.map(c => c.key),
    ...statFieldKeys,
  ]);
  const hasSummary = summaryKeys.size > 0 && rows.length > 0;

  const tableColumns = children.map((col, idx) => {
    const isNumeric = NUMERIC_ALIGN_TYPES.has(col.type);
    return {
      title: col.label,
      dataIndex: col.key,
      key: col.key,
      ...(fixFirstCol && idx === 0 ? { fixed: 'left' as const, width: 120 } : {}),
      ...(isNumeric ? { align: 'right' as const } : {}),
      render: (cellVal: unknown, row: Record<string, unknown>) => {
        return renderCellValue(col, cellVal, row, resolvedMap);
      },
    };
  });

  return (
    <div className={styles.readonlyTableWrapper}>
      <Table
        columns={tableColumns}
        dataSource={rows.map((row, idx) => ({ ...row, _key: idx }))}
        rowKey="_key"
        size="small"
        pagination={false}
        bordered
        scroll={{ x: 'max-content' as const }}
        summary={hasSummary ? () => (
          <Table.Summary.Row>
            {children.map((col, idx) => {
              if (!summaryKeys.has(col.key)) {
                return <Table.Summary.Cell key={col.key} index={idx}>-</Table.Summary.Cell>;
              }
              const values = rows.map(r => Number(r[col.key]) || 0);
              const total = values.reduce((a, b) => a + b, 0);
              const precision = col.formulaPrecision ?? 2;
              return (
                <Table.Summary.Cell key={col.key} index={idx} align="right">
                  <strong>{total.toLocaleString(undefined, { minimumFractionDigits: precision, maximumFractionDigits: precision })}</strong>
                </Table.Summary.Cell>
              );
            })}
          </Table.Summary.Row>
        ) : undefined}
      />
    </div>
  );
};

export default ReadonlyTable;
