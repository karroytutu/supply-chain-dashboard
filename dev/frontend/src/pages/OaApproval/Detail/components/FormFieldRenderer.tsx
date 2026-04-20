import React from 'react';
import { Tag, Typography, Table } from 'antd';
import type { FormField } from '@/types/oa-approval';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format';
import { FileTextOutlined } from '@ant-design/icons';
import styles from '../index.less';

const { Text } = Typography;

/** 渲染表格单元格值 */
function renderCellValue(childField: FormField, cellValue: unknown): React.ReactNode {
  if (cellValue === null || cellValue === undefined || cellValue === '') {
    return <Text type="secondary">-</Text>;
  }
  switch (childField.type) {
    case 'money':
      return formatCurrency(cellValue as number);
    case 'number':
      return (cellValue as number).toLocaleString();
    case 'select':
      const option = childField.options?.find((o) => o.value === cellValue);
      return option?.label || String(cellValue);
    default:
      return String(cellValue);
  }
}

/** 字段渲染器 */
const FieldRenderer: React.FC<{ field: FormField; value: unknown }> = ({ field, value }) => {
  if (value === null || value === undefined || value === '') {
    return <Text type="secondary">-</Text>;
  }

  switch (field.type) {
    case 'money':
      return <Text strong>{formatCurrency(value as number)}</Text>;
    case 'number':
      return <Text>{(value as number).toLocaleString()}</Text>;
    case 'date':
      return <Text>{formatDate(value as string)}</Text>;
    case 'datetime':
      return <Text>{formatDateTime(value as string)}</Text>;
    case 'select':
    case 'radio':
      const option = field.options?.find((o) => o.value === value);
      return <Text>{option?.label || (value as string)}</Text>;
    case 'upload':
      const files = value as Array<{ name: string; url: string }>;
      if (!files || files.length === 0) return <Text type="secondary">-</Text>;
      return (
        <div className={styles.fileList}>
          {files.map((file, index) => (
            <a key={index} href={file.url} target="_blank" rel="noopener noreferrer">
              <FileTextOutlined /> {file.name}
            </a>
          ))}
        </div>
      );
    case 'user':
    case 'dept':
    case 'erp_department':
    case 'erp_staff':
      return <Text>{(value as { name?: string })?.name || String(value)}</Text>;
    case 'asset_search':
      // asset_search 字段存的是ID，显示为文本
      return <Text>{String(value)}</Text>;
    case 'erp_payment_account':
    case 'erp_asset_category':
      return <Text>{String(value)}</Text>;
    case 'textarea':
      return <Text style={{ whiteSpace: 'pre-wrap' }}>{value as string}</Text>;
    case 'table':
      const rows = value as Record<string, unknown>[];
      const children = field.children || [];
      if (!rows || rows.length === 0) return <Text type="secondary">-</Text>;
      const tableColumns = children.map((col) => ({
        title: col.label,
        dataIndex: col.key,
        key: col.key,
        render: (cellVal: unknown) => renderCellValue(col, cellVal),
      }));
      return (
        <Table
          columns={tableColumns}
          dataSource={rows.map((row, idx) => ({ ...row, _key: idx }))}
          rowKey="_key"
          size="small"
          pagination={false}
          bordered
        />
      );
    default:
      return <Text>{String(value)}</Text>;
  }
};

export default FieldRenderer;
