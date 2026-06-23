/**
 * ERP 字段统一控件（所有 erp_* 类型）
 * mode=readonly: 名称展示（storedName → resolvedMap → ErpNameDisplay 三级兜底）
 * mode=editable: ErpFieldRenderer（含 autoFill 联动）
 */
import React from 'react';
import { Tag, Typography } from 'antd';
import { formatCurrency } from '@/utils/format';
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

  // readonly — 结算单类型
  if (field.type === 'erp_settlement_order') {
    const orderIds = value as number[];
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return <Text type="secondary">-</Text>;
    }
    // 结构化明细 JSON → 渲染小表格
    if (field.detailsField && formData?.[field.detailsField]) {
      try {
        const parsed = JSON.parse(String(formData[field.detailsField]));
        if (Array.isArray(parsed) && parsed.length > 0) {
          const details = parsed as Array<{ bizStr: string; leftAmount: string }>;
          const total = details.reduce((sum, d) => sum + (parseFloat(d.leftAmount) || 0), 0);
          return (
            <table style={{ fontSize: 13, borderCollapse: 'collapse', width: '100%' }}>
              <tbody>
                {details.map((d, i) => (
                  <tr key={i}>
                    <td style={{ padding: '2px 8px 2px 0' }}>{d.bizStr}</td>
                    <td style={{ padding: '2px 0', textAlign: 'right' }}>{formatCurrency(d.leftAmount)}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: '4px 8px 0 0', fontWeight: 500, borderTop: '1px solid #f0f0f0' }}>
                    合计 ({details.length} 单)
                  </td>
                  <td style={{ padding: '4px 0 0', fontWeight: 500, textAlign: 'right', borderTop: '1px solid #f0f0f0' }}>
                    {formatCurrency(total)}
                  </td>
                </tr>
              </tbody>
            </table>
          );
        }
      } catch {
        /* JSON 解析失败，降级到下方逻辑 */
      }
    }
    // nameField 兜底
    const storedSettlementNames = resolveStoredName(field.nameField, formData);
    if (storedSettlementNames) {
      return (
        <div>
          {storedSettlementNames.split(', ').map((name, i) => (
            <Tag key={i}>{name}</Tag>
          ))}
        </div>
      );
    }
    // resolvedMap / ErpNameDisplay 兜底
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
