/**
 * ERP 字段统一控件（所有 erp_* 类型）
 * mode=readonly: 名称展示（storedName → resolvedMap → ErpNameDisplay 三级兜底）
 * mode=editable: ErpFieldRenderer（含 autoFill 联动）
 */
import React from 'react';
import { Typography } from 'antd';
import { ERP_SEARCH_API_MAP } from '@/constants/oa-erp';
import ErpNameDisplay from '../ErpNameDisplay';
import { resolveStoredName } from '../utils/resolveStoredName';
import ErpFieldRenderer from '@/pages/Oa/Form/components/ErpFieldRenderer';
import type { FieldControlProps } from './types';

const { Text } = Typography;

const ErpFieldControl: React.FC<FieldControlProps> = ({ mode, field, value, onChange, formData, resolvedMap, fakeForm }) => {
  if (mode === 'editable') {
    return (
      <ErpFieldRenderer
        field={field}
        value={value}
        onChange={onChange!}
        cascadeValue={field.cascadeFrom ? formData?.[field.cascadeFrom] : undefined}
        form={fakeForm || { setFieldsValue: () => {}, getFieldValue: () => undefined }}
      />
    );
  }

  // readonly — 单选 ERP 类型
  if (value === null || value === undefined || value === '') {
    return <Text type="secondary">-</Text>;
  }
  const storedName = resolveStoredName(field.nameField, formData);
  if (storedName) return <Text>{storedName}</Text>;
  if (field.searchApi) {
    const erpType = ERP_SEARCH_API_MAP[field.searchApi];
    if (erpType) {
      const cacheKey = `${erpType}:${value}`;
      if (resolvedMap?.[cacheKey]) {
        return <Text>{resolvedMap[cacheKey]}</Text>;
      }
      return <ErpNameDisplay erpType={erpType} id={value} />;
    }
  }
  return <Text>{String(value)}</Text>;
};

export default ErpFieldControl;
