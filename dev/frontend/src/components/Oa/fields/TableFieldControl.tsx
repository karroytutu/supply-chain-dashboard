/**
 * 表格字段统一控件（table）
 * mode=readonly: 委托 TableFieldRenderer readonly 模式
 * mode=editable: 委托 TableFieldRenderer editable 模式
 */
import React, { useMemo } from 'react';
import { Typography } from 'antd';
import TableFieldRenderer from '@/pages/Oa/Form/components/TableFieldRenderer';
import type { FieldControlProps } from './types';
import type { FieldPermission } from '@/types/oa';

const { Text } = Typography;

const TableFieldControl: React.FC<FieldControlProps> = ({ mode, field, value, onChange, resolvedMap, fieldPermissions }) => {
  const rows = (value as Record<string, unknown>[]) || [];

  // 从全局权限配置中提取当前表格的子字段权限（如 feeLines.feeUnitPrice -> feeUnitPrice）
  const subFieldPermissions = useMemo(() => {
    if (!fieldPermissions) return undefined;
    const prefix = `${field.key}.`;
    const entries = Object.entries(fieldPermissions)
      .filter(([k]) => k.startsWith(prefix))
      .map(([k, v]) => [k.slice(prefix.length), v] as [string, FieldPermission]);
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }, [fieldPermissions, field.key]);

  if (rows.length === 0 && mode === 'readonly') {
    return <Text type="secondary">-</Text>;
  }
  return (
    <TableFieldRenderer
      field={field}
      value={rows}
      onChange={onChange}
      readonly={mode === 'readonly'}
      resolvedMap={resolvedMap}
      subFieldPermissions={subFieldPermissions}
    />
  );
};

export default TableFieldControl;
