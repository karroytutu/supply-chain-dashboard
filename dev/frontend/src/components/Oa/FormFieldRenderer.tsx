/**
 * 字段只读渲染器（facade）
 * 委托 FieldControlDispatcher mode="readonly" 实现，保持现有 API 不变
 * 调用方（FormFieldsDiff、FormFieldDiff 等）无需修改
 */
import React from 'react';
import type { FormField } from '@/types/oa';
import type { ErpResolvedMap } from './hooks/useErpFieldResolve';
import FieldControlDispatcher from './fields';

/** 字段渲染器 — 只读模式门面 */
const FieldRenderer: React.FC<{
  field: FormField;
  value: unknown;
  /** 完整表单数据，用于提取 ERP 关联参数（如结算单需要 customerId） */
  formData?: Record<string, unknown>;
  /** ERP ID 批量预解析结果 */
  resolvedMap?: ErpResolvedMap;
  /** ERP 客户执照图片 URL（由 useErpLicenseResolve 提供，兼容历史数据） */
  erpLicenseUrls?: string[];
}> = ({ field, value, formData, resolvedMap, erpLicenseUrls }) => {
  // searchApi 表格字段：value 可能是 ID 数组或 undefined，需从 _details 解析为记录数组
  let resolvedValue = value;
  if (field.type === 'table' && field.searchApi) {
    const details = formData?._details as Record<string, unknown> | undefined;
    const detailRecords = details?.[field.key];
    if (Array.isArray(detailRecords) && detailRecords.length > 0 && typeof detailRecords[0] === 'object') {
      resolvedValue = detailRecords;
    }
  }
  return (
    <FieldControlDispatcher
      mode="readonly"
      field={field}
      value={resolvedValue}
      formData={formData}
      resolvedMap={resolvedMap}
      erpLicenseUrls={erpLicenseUrls}
    />
  );
};

export default FieldRenderer;
