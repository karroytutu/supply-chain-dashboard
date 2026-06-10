/**
 * 表格布局共享工具模块
 * 提供容器宽度监听、列宽计算、表格样式常量
 * 供 FormFieldRenderer（只读表格）和 TableFieldRenderer（可编辑表格）共用
 */
import React, { useRef, useState, useCallback } from 'react';
import type { FormField } from '@/types/oa';

// =====================================================
// ERP 字段类型集合
// =====================================================

/** 所有 ERP 字段类型（取 FormFieldRenderer 与 TableFieldRenderer 的并集） */
export const TABLE_ERP_TYPES = new Set([
  'erp_customer', 'erp_department', 'erp_staff',
  'erp_payment_account', 'erp_asset_category', 'asset_search',
  'erp_grade', 'erp_group', 'erp_area',
  'erp_settlement_order',
]);

// =====================================================
// 表格样式常量
// =====================================================

/** 数字/金额类型列右对齐 */
export const NUMERIC_ALIGN_TYPES = new Set(['money', 'number']);

/** 文本类型列启用省略号 */
export const ELLIPSIS_TYPES = new Set(['text', 'textarea']);

// =====================================================
// Hook: 容器宽度监听
// =====================================================

/** 监听容器宽度变化（基于原生 ResizeObserver） */
export function useContainerWidth(): [React.RefCallback<HTMLDivElement>, number] {
  const [width, setWidth] = useState(800);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (node) {
      setWidth(node.clientWidth || 800);
      observerRef.current = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) setWidth(entry.contentRect.width);
      });
      observerRef.current.observe(node);
    }
  }, []);

  return [ref, width];
}

// =====================================================
// 列宽计算
// =====================================================

/** 根据字段类型计算列最小宽度 */
export function getColumnWidth(col: FormField): number {
  const t = col.type;
  if (TABLE_ERP_TYPES.has(t)) return 160;
  switch (t) {
    case 'date': return 130;
    case 'datetime': return 180;
    case 'money': return 130;
    case 'number': return 100;
    case 'text': return 150;
    case 'textarea': return 200;
    case 'select':
    case 'multi-select': return 120;
    default: return 120;
  }
}
