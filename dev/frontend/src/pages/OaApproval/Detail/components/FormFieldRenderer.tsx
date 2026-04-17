import React from 'react';
import { Tag, Typography } from 'antd';
import type { FormField } from '@/types/oa-approval';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format';
import { FileTextOutlined } from '@ant-design/icons';
import styles from '../index.less';

const { Text } = Typography;

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
      return <Text>{(value as { name: string }).name || (value as string)}</Text>;
    case 'dept':
      return <Text>{(value as { name: string }).name || (value as string)}</Text>;
    case 'textarea':
      return <Text style={{ whiteSpace: 'pre-wrap' }}>{value as string}</Text>;
    default:
      return <Text>{value as string}</Text>;
  }
};

export default FieldRenderer;
