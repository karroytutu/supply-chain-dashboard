/**
 * 表格类型字段渲染器
 * 统一支持可编辑模式（增删行、单元格输入）和只读模式（纯文本展示 + 汇总行）
 * 通过 readonly prop 切换模式，消除了原先 ReadonlyTable 的重复实现
 */
import React, { useCallback } from 'react';
import { Button, Input, InputNumber, Select, DatePicker, Table, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { FormField, FieldPermission } from '@/types/oa';
import { evaluateFormula } from '@/utils/formula-evaluator';
import { TABLE_ERP_TYPES, useContainerWidth, getColumnWidth, NUMERIC_ALIGN_TYPES } from '@/components/Oa/hooks/useContainerWidth';
import { renderCellValue } from '@/components/Oa/cellValueRenderer';
import type { ErpResolvedMap } from '@/components/Oa/hooks/useErpFieldResolve';
import ErpFieldRenderer from './ErpFieldRenderer';
import styles from '../index.less';

interface TableFieldRendererProps {
  field: FormField;
  value?: Record<string, unknown>[];
  onChange?: (value: Record<string, unknown>[]) => void;
  /** 表格子字段权限（key为子字段key，如 feeLines.feeUnitPrice → feeUnitPrice） */
  subFieldPermissions?: Record<string, FieldPermission>;
  /** 只读模式：隐藏操作列和添加按钮，使用 cellValueRenderer 渲染纯文本 */
  readonly?: boolean;
  /** 只读模式下传入的 ERP 解析结果 */
  resolvedMap?: ErpResolvedMap;
}

/** 重算行内公式字段，返回更新后的行数据 */
function recalcRowFormulas(
  row: Record<string, unknown>,
  columns: FormField[],
): Record<string, unknown> {
  const formulaChildren = columns.filter(c => c.type === 'formula' && c.formula);
  if (formulaChildren.length === 0) return row;
  const updated = { ...row };
  for (const fc of formulaChildren) {
    const result = evaluateFormula(fc.formula!, updated);
    const precision = fc.formulaPrecision ?? 2;
    updated[fc.key] = Number(result.toFixed(precision));
  }
  return updated;
}

/** 渲染单个单元格输入组件 */
const CellInput: React.FC<{
  childField: FormField;
  value: unknown;
  onChange: (val: unknown) => void;
  /** 同行数据，用于 ERP 级联和 nameField 写入 */
  rowData: Record<string, unknown>;
  /** 更新同行多个字段（nameField + autoFill 写入用） */
  onRowUpdate: (updates: Record<string, unknown>) => void;
  /** 表格是否处于只读模式 */
  disabled?: boolean;
}> = ({ childField, value, onChange, rowData, onRowUpdate, disabled }) => {
  // disabled 模式下渲染为只读文本
  if (disabled) {
    if (value == null || value === '') {
      return <span style={{ fontSize: 13, color: '#999' }}>-</span>;
    }
    // 金额字段：保留两位小数 + 千位分隔
    let displayValue: string;
    if (childField.type === 'money') {
      const num = Number(value);
      displayValue = !isNaN(num)
        ? num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : String(value);
    } else {
      displayValue = String(value);
    }
    // 附加单位后缀（如库存的“件”、可售天数的“天”）
    if (childField.suffix) {
      displayValue += childField.suffix;
    }
    return <span style={{ fontSize: 13 }}>{displayValue}</span>;
  }

  // ERP 字段类型：使用 ErpFieldRenderer
  if (TABLE_ERP_TYPES.has(childField.type)) {
    const cascadeValue = childField.cascadeFrom ? rowData[childField.cascadeFrom] : undefined;
    return (
      <ErpFieldRenderer
        field={childField}
        value={value}
        onChange={onChange}
        cascadeValue={cascadeValue}
        form={{
          setFieldsValue: (values) => {
            // nameField 写入 + autoFill 写入：更新到同行数据
            onRowUpdate(values);
          },
          getFieldValue: (name: string) => rowData[name],
        }}
      />
    );
  }

  switch (childField.type) {
    case 'number':
    case 'money':
      return (
        <InputNumber
          style={{ width: '100%' }}
          placeholder={childField.placeholder || `请输入${childField.label}`}
          min={childField.min}
          max={childField.max}
          precision={childField.type === 'money' ? 2 : childField.precision}
          value={value as number | undefined}
          onChange={(v) => onChange(v)}
          size="small"
        />
      );
    case 'select':
      return (
        <Select
          style={{ width: '100%' }}
          placeholder={childField.placeholder || `请选择${childField.label}`}
          options={childField.options}
          value={value as string | undefined}
          onChange={(v) => onChange(v)}
          size="small"
        />
      );
    case 'date':
      return (
        <DatePicker
          style={{ width: '100%' }}
          placeholder={childField.placeholder || '请选择日期'}
          value={value ? dayjs(value as string) : undefined}
          onChange={(_, dateString) => onChange(dateString as string)}
          size="small"
        />
      );
    case 'textarea':
      return (
        <Input.TextArea
          placeholder={childField.placeholder || `请输入${childField.label}`}
          value={value as string | undefined}
          onChange={(e) => onChange(e.target.value)}
          autoSize={{ minRows: 1 }}
          size="small"
        />
      );
    case 'formula':
      // 公式字段：只读展示，值由行内公式重算逻辑自动填充
      return (
        <InputNumber
          style={{ width: '100%' }}
          precision={childField.formulaPrecision ?? 2}
          value={value != null ? Number(value) : undefined}
          disabled
          size="small"
        />
      );
    case 'text':
    default:
      return (
        <Input
          placeholder={childField.placeholder || `请输入${childField.label}`}
          value={value as string | undefined}
          onChange={(e) => onChange(e.target.value)}
          size="small"
        />
      );
  }
};

const TableFieldRenderer: React.FC<TableFieldRendererProps> = ({ field, value = [], onChange, subFieldPermissions, readonly: isReadonly, resolvedMap }) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  const columns = field.children || [];
  // 过滤 hidden 子字段，仅渲染可见列（hidden 子字段已在数据层 applyFieldPermissions 中过滤）
  const visibleColumns = columns.filter(col => !col.hidden);
  const [containerRef, containerWidth] = useContainerWidth();
  const fixFirstCol = visibleColumns.length >= 4;
  const isDisabled = !!field.disabled;
  // 混合模式：表格非整体只读，但存在 disabled 子列（如物流费用明细表）
  // 此类表格的只读列应自适应内容宽度，与纯只读表格行为一致
  // 参考《只读表格列宽自适应与换行规范》《采购明细表格布局规范》
  const useContentWidth = isReadonly || isDisabled || visibleColumns.some(col => col.disabled);

  // ==================== 只读模式汇总行 ====================

  const formulaChildren = columns.filter(c => c.type === 'formula' && c.formula);
  const statFieldKeys = (field.statField || []).map(s => s.componentId);
  const summaryKeys = new Set([
    ...formulaChildren.map(c => c.key),
    ...statFieldKeys,
  ]);
  const hasSummary = isReadonly && summaryKeys.size > 0 && (value?.length ?? 0) > 0;

  const handleAdd = useCallback(() => {
    const newRow: Record<string, unknown> = {};
    columns.forEach((col) => {
      newRow[col.key] = col.defaultValue ?? undefined;
    });
    // 初始化行内公式字段（对默认值求值）
    const rowWithFormulas = recalcRowFormulas(newRow, columns);
    onChange?.([...value, rowWithFormulas]);
  }, [value, columns, onChange]);

  const handleRemove = useCallback((index: number) => {
    const newValue = [...value];
    newValue.splice(index, 1);
    onChange?.(newValue);
  }, [value, onChange]);

  const handleCellChange = useCallback((rowIndex: number, key: string, cellValue: unknown) => {
    const newValue = [...value];
    const updatedRow = { ...newValue[rowIndex], [key]: cellValue };
    newValue[rowIndex] = recalcRowFormulas(updatedRow, columns);
    onChange?.(newValue);
  }, [value, onChange, columns]);

  /** 更新同行多个字段（ERP 字段 nameField + autoFill 写入），同时重算行内公式 */
  const handleRowUpdate = useCallback((rowIndex: number, updates: Record<string, unknown>) => {
    const newValue = [...value];
    const updatedRow = { ...newValue[rowIndex], ...updates };
    newValue[rowIndex] = recalcRowFormulas(updatedRow, columns);
    onChange?.(newValue);
  }, [value, onChange, columns]);

  const tableColumns = [
    ...visibleColumns.map((col, idx) => ({
      title: isReadonly ? col.label : col.label + (col.required ? ' *' : ''),
      dataIndex: col.key,
      key: col.key,
      // 只读模式或 disabled 列：不设固定宽度，自适应内容
      ...(isReadonly || isDisabled || col.disabled ? {} : { width: getColumnWidth(col) }),
      ...(isReadonly && NUMERIC_ALIGN_TYPES.has(col.type) ? { align: 'right' as const } : {}),
      ...(fixFirstCol && idx === 0 && !isReadonly ? { fixed: 'left' as const, width: 120 } : {}),
      render: (_: unknown, record: Record<string, unknown>, rowIndex: number) => {
        if (isReadonly) {
          return renderCellValue(col, record[col.key], record, resolvedMap);
        }
        return (
          <CellInput
            childField={col}
            value={record[col.key]}
            onChange={(v) => handleCellChange(rowIndex, col.key, v)}
            rowData={record}
            onRowUpdate={(updates) => handleRowUpdate(rowIndex, updates)}
            disabled={isDisabled || !!col.disabled || subFieldPermissions?.[col.key] === 'readonly'}
          />
        );
      },
    })),
    // 只读、行锁定或整体 disabled 时不显示删除操作列
    ...(isReadonly || isDisabled || field.rowLocked ? [] : [{
      title: '',
      key: '_action',
      width: 50,
      render: (_: unknown, __: unknown, rowIndex: number) => (
        <Popconfirm title="确定删除此行？" onConfirm={() => handleRemove(rowIndex)} okText="确定" cancelText="取消">
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    }]),
  ];

  const columnWidthsSum = tableColumns.reduce((sum, c) => sum + ((c.width as number) || 0), 0);

  return (
    <div ref={containerRef} className={styles.tableFieldWrapper}>
      <Table
        columns={tableColumns}
        dataSource={value.map((row, idx) => ({ ...row, _key: idx }))}
        rowKey="_key"
        size="small"
        pagination={false}
        bordered
        scroll={useContentWidth
          ? { x: 'max-content' as const }
          : { x: containerWidth > 0 ? Math.max(containerWidth, columnWidthsSum) : columnWidthsSum }
        }
        summary={hasSummary ? () => (
          <Table.Summary.Row>
            {visibleColumns.map((col, idx) => {
              if (!summaryKeys.has(col.key)) {
                return <Table.Summary.Cell key={col.key} index={idx}>-</Table.Summary.Cell>;
              }
              const values = value!.map(r => Number(r[col.key]) || 0);
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
      {!isReadonly && !isDisabled && !field.rowLocked && (
        <Button type="dashed" onClick={handleAdd} icon={<PlusOutlined />} style={{ width: '100%', marginTop: 8 }}>
          添加一行
        </Button>
      )}
    </div>
  );
};

export default TableFieldRenderer;
