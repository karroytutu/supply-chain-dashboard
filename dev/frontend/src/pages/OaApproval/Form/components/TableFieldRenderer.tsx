/**
 * 表格类型字段渲染器
 * 支持动态增删行，每行按 children 定义渲染子字段
 */
import React, { useCallback } from 'react';
import { Button, Input, InputNumber, Select, DatePicker, Table, Space, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { FormField } from '@/types/oa-approval';

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
}> = ({ childField, value, onChange }) => {
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
          value={value ? (() => { const m = require('dayjs'); return m.default(value); })() : undefined}
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
