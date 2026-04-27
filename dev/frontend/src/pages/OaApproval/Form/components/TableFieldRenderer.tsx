/**
 * 表格类型字段渲染器
 * 支持动态增删行，每行按 children 定义渲染子字段
 */
import React, { useCallback } from 'react';
import { Button, Input, InputNumber, Select, DatePicker, Table, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { FormField } from '@/types/oa-approval';
import ErpFieldRenderer from './ErpFieldRenderer';

/** ERP 字段类型集合 */
const ERP_FIELD_TYPES = new Set([
  'asset_search', 'erp_department', 'erp_staff',
  'erp_payment_account', 'erp_asset_category', 'erp_customer', 'erp_settlement_order',
]);

interface TableFieldRendererProps {
  field: FormField;
  value?: Record<string, unknown>[];
  onChange?: (value: Record<string, unknown>[]) => void;
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
}> = ({ childField, value, onChange, rowData, onRowUpdate }) => {
  // ERP 字段类型：使用 ErpFieldRenderer
  if (ERP_FIELD_TYPES.has(childField.type)) {
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
  const columns = field.children || [];

  const handleAdd = useCallback(() => {
    const newRow: Record<string, unknown> = {};
    columns.forEach((col) => {
      newRow[col.key] = col.defaultValue ?? undefined;
    });
    onChange?.([...value, newRow]);
  }, [value, columns, onChange]);

  const handleRemove = useCallback((index: number) => {
    const newValue = [...value];
    newValue.splice(index, 1);
    onChange?.(newValue);
  }, [value, onChange]);

  const handleCellChange = useCallback((rowIndex: number, key: string, cellValue: unknown) => {
    const newValue = [...value];
    newValue[rowIndex] = { ...newValue[rowIndex], [key]: cellValue };
    onChange?.(newValue);
  }, [value, onChange]);

  /** 更新同行多个字段（ERP 字段 nameField + autoFill 写入） */
  const handleRowUpdate = useCallback((rowIndex: number, updates: Record<string, unknown>) => {
    const newValue = [...value];
    newValue[rowIndex] = { ...newValue[rowIndex], ...updates };
    onChange?.(newValue);
  }, [value, onChange]);

  const tableColumns = [
    ...columns.map((col) => ({
      title: col.label + (col.required ? ' *' : ''),
      dataIndex: col.key,
      key: col.key,
      width: Math.max(120, col.label.length * 20 + 40),
      render: (_: unknown, record: Record<string, unknown>, rowIndex: number) => (
        <CellInput
          childField={col}
          value={record[col.key]}
          onChange={(v) => handleCellChange(rowIndex, col.key, v)}
          rowData={record}
          onRowUpdate={(updates) => handleRowUpdate(rowIndex, updates)}
        />
      ),
    })),
    {
      title: '',
      key: '_action',
      width: 50,
      render: (_: unknown, __: unknown, rowIndex: number) => (
        <Popconfirm title="确定删除此行？" onConfirm={() => handleRemove(rowIndex)} okText="确定" cancelText="取消">
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <Table
        columns={tableColumns}
        dataSource={value.map((row, idx) => ({ ...row, _key: idx }))}
        rowKey="_key"
        size="small"
        pagination={false}
        bordered
        scroll={{ x: columns.length * 150 }}
      />
      <Button type="dashed" onClick={handleAdd} icon={<PlusOutlined />} style={{ width: '100%', marginTop: 8 }}>
        添加一行
      </Button>
    </div>
  );
};

export default TableFieldRenderer;
