/**
 * 表格类型字段渲染器
 * 支持动态增删行，每行按 children 定义渲染子字段
 */
import React, { useCallback } from 'react';
import { Button, Input, InputNumber, Select, DatePicker, Table, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { FormField } from '@/types/oa';
import { evaluateFormula } from '@/utils/formula-evaluator';
import { TABLE_ERP_TYPES, useContainerWidth, getColumnWidth } from '@/components/Oa/hooks/useContainerWidth';
import ErpFieldRenderer from './ErpFieldRenderer';
import styles from '../index.less';

interface TableFieldRendererProps {
  field: FormField;
  value?: Record<string, unknown>[];
  onChange?: (value: Record<string, unknown>[]) => void;
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

const TableFieldRenderer: React.FC<TableFieldRendererProps> = ({ field, value = [], onChange }) => {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 依赖稳定无需重复触发
  const columns = field.children || [];
  const [containerRef, containerWidth] = useContainerWidth();
  const fixFirstCol = columns.length >= 4; // 与 ReadonlyTable 统一：列数≥4时固定首列
  const isDisabled = !!field.disabled;

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
    ...columns.map((col, idx) => ({
      title: col.label + (col.required ? ' *' : ''),
      dataIndex: col.key,
      key: col.key,
      // disabled 模式下不设固定宽度，让列宽自适应填充容器
      ...(!isDisabled ? { width: getColumnWidth(col) } : {}),
      ...(fixFirstCol && idx === 0 && !isDisabled ? { fixed: 'left' as const } : {}),
      render: (_: unknown, record: Record<string, unknown>, rowIndex: number) => (
        <CellInput
          childField={col}
          value={record[col.key]}
          onChange={(v) => handleCellChange(rowIndex, col.key, v)}
          rowData={record}
          onRowUpdate={(updates) => handleRowUpdate(rowIndex, updates)}
          disabled={isDisabled}
        />
      ),
    })),
    // 仅在非 disabled 状态下显示删除操作列
    ...(isDisabled ? [] : [{
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
        scroll={isDisabled
          ? { x: 'max-content' as const }
          : { x: containerWidth > 0 ? Math.max(containerWidth, columnWidthsSum) : columnWidthsSum }
        }
      />
      {!isDisabled && (
        <Button type="dashed" onClick={handleAdd} icon={<PlusOutlined />} style={{ width: '100%', marginTop: 8 }}>
          添加一行
        </Button>
      )}
    </div>
  );
};

export default TableFieldRenderer;
