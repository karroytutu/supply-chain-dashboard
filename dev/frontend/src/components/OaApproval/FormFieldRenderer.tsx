import React from 'react';
import { Tag, Typography, Table, Image } from 'antd';
import type { FormField } from '@/types/oa-approval';
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format';
import { ERP_SEARCH_API_MAP } from '@/constants/oa-approval-erp';
import { FileTextOutlined } from '@ant-design/icons';
import ErpNameDisplay from './ErpNameDisplay';
import type { ErpResolvedMap } from './hooks/useErpFieldResolve';
import styles from './FormFieldRenderer.less';

const { Text } = Typography;

/** 渲染表格单元格值 */
function renderCellValue(
  childField: FormField,
  cellValue: unknown,
  rowData?: Record<string, unknown>,
  resolvedMap?: ErpResolvedMap,
): React.ReactNode {
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
    case 'erp_customer':
    case 'erp_department':
    case 'erp_staff':
    case 'erp_payment_account':
    case 'erp_asset_category':
    case 'asset_search': {
      // 第一优先级：行数据中已存储的名称（nameField）
      if (childField.nameField && rowData?.[childField.nameField]) {
        const storedName = String(rowData[childField.nameField]).trim();
        if (storedName) return storedName;
      }
      // 第二优先级：批量预解析结果
      if (childField.searchApi) {
        const erpType = ERP_SEARCH_API_MAP[childField.searchApi];
        if (erpType) {
          const cacheKey = `${erpType}:${cellValue}`;
          if (resolvedMap?.[cacheKey]) {
            return resolvedMap[cacheKey];
          }
          // 第三优先级：ErpNameDisplay 兜底
          return <ErpNameDisplay erpType={erpType} id={cellValue} />;
        }
      }
      return String(cellValue);
    }
    default:
      return String(cellValue);
  }
}

/** 字段渲染器 */
const FieldRenderer: React.FC<{
  field: FormField;
  value: unknown;
  /** 完整表单数据，用于提取 ERP 关联参数（如结算单需要 customerId） */
  formData?: Record<string, unknown>;
  /** ERP ID 批量预解析结果 */
  resolvedMap?: ErpResolvedMap;
}> = ({ field, value, formData, resolvedMap }) => {
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
    case 'date-range':
      const dates = value as [string, string];
      if (!Array.isArray(dates) || dates.length < 2) return <Text>{String(value)}</Text>;
      return <Text>{formatDate(dates[0])} ~ {formatDate(dates[1])}</Text>;
    case 'select':
    case 'radio':
      const option = field.options?.find((o) => o.value === value);
      return <Text>{option?.label || (value as string)}</Text>;
    case 'multi-select':
      const multiValues = value as string[];
      if (!Array.isArray(multiValues) || multiValues.length === 0) {
        return <Text type="secondary">-</Text>;
      }
      return (
        <div>
          {multiValues.map((v) => {
            const opt = field.options?.find((o) => o.value === v);
            return <Tag key={v}>{opt?.label || v}</Tag>;
          })}
        </div>
      );
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
    case 'photo':
      const photos = value as Array<{ uid?: string; name?: string; url?: string; thumbUrl?: string; status?: string }>;
      if (!photos || photos.length === 0) return <Text type="secondary">-</Text>;
      return (
        <div className={styles.fileList}>
          <Image.PreviewGroup>
            {photos.map((photo, index) => {
              const src = photo.thumbUrl || photo.url;
              if (!src) return null;
              return (
                <Image
                  key={photo.uid || index}
                  src={src}
                  width={60}
                  height={60}
                  style={{ objectFit: 'cover', borderRadius: 4, marginRight: 8 }}
                  alt={photo.name || '图片'}
                  preview={photo.url && photo.url !== src ? { src: photo.url } : undefined}
                />
              );
            })}
          </Image.PreviewGroup>
        </div>
      );
    case 'user':
    case 'dept':
      return <Text>{(value as { name?: string })?.name || String(value)}</Text>;
    case 'erp_customer':
    case 'erp_department':
    case 'erp_staff':
    case 'erp_payment_account':
    case 'erp_asset_category':
    case 'asset_search': {
      // 第一优先级：formData 中已存储的名称（nameField）
      if (field.nameField && formData?.[field.nameField]) {
        const storedName = String(formData[field.nameField]).trim();
        if (storedName) return <Text>{storedName}</Text>;
      }
      // 第二优先级：批量预解析结果
      if (field.searchApi) {
        const erpType = ERP_SEARCH_API_MAP[field.searchApi];
        if (erpType) {
          const cacheKey = `${erpType}:${value}`;
          if (resolvedMap?.[cacheKey]) {
            return <Text>{resolvedMap[cacheKey]}</Text>;
          }
          // 第三优先级：ErpNameDisplay 兜底
          return <ErpNameDisplay erpType={erpType} id={value} />;
        }
      }
      return <Text>{String(value)}</Text>;
    }
    case 'erp_settlement_order': {
      const orderIds = value as number[];
      if (!Array.isArray(orderIds) || orderIds.length === 0) {
        return <Text type="secondary">-</Text>;
      }
      // 第一优先级：已存储的名称（逗号分隔字符串）
      if (field.nameField && formData?.[field.nameField]) {
        const storedNames = String(formData[field.nameField]).trim();
        if (storedNames) {
          return (
            <div>
              {storedNames.split(', ').map((name, i) => (
                <Tag key={i}>{name}</Tag>
              ))}
            </div>
          );
        }
      }
      // 第二优先级 + 第三优先级
      const settlementParams = formData?.customer
        ? { consumerId: String(formData.customer) }
        : undefined;
      const erpType = 'settlement-orders';
      return (
        <div>
          {orderIds.map((id) => {
            const cacheKey = `${erpType}:${id}`;
            if (resolvedMap?.[cacheKey]) {
              return <Tag key={id}>{resolvedMap[cacheKey]}</Tag>;
            }
            return (
              <Tag key={id}>
                <ErpNameDisplay erpType={erpType} id={id} extraParams={settlementParams} />
              </Tag>
            );
          })}
        </div>
      );
    }
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
        render: (cellVal: unknown, row: Record<string, unknown>) =>
          renderCellValue(col, cellVal, row, resolvedMap),
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
