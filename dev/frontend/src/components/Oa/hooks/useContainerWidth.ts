/**
 * 表格布局共享工具模块
 * 提供容器宽度监听、列宽计算、表格样式常量
 * 供 FormFieldRenderer（只读表格）和 TableFieldRenderer（可编辑表格）共用
 */
import { useRef, useState, useLayoutEffect } from 'react';
import type { RefObject } from 'react';
import type { FormField } from '@/types/oa';

// =====================================================
// ERP 数据选择字段识别
// =====================================================

/** 判断是否为 ERP 数据选择字段（通过 searchApi 配置识别） */
export function isErpSelectField(col: FormField): boolean {
  return col.type === 'select' && !!col.searchApi;
}

// ERP 选择字段判断

// =====================================================
// 表格样式常量
// =====================================================

/** 数字/金额类型列右对齐 */
export const NUMERIC_ALIGN_TYPES = new Set(['money', 'number', 'formula']);

// =====================================================
// Hook: 容器宽度监听
// =====================================================

/** 监听容器宽度变化（基于原生 ResizeObserver）
 * 观察父元素而非自身，避免 Ant Design Table scroll.x 设置后影响自身测量导致反馈循环
 * 返回 RefObject 以兼容 useColumnWidths 的类型要求
 */
export function useContainerWidth(): [RefObject<HTMLDivElement>, number] {
  const [width, setWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 800));
  const nodeRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const lastWidthRef = useRef(0);

  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node) return;

    const target = node.parentElement || node;
    const initialWidth = target.clientWidth || 800;
    lastWidthRef.current = initialWidth;
    setWidth(initialWidth);

    observerRef.current = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const newWidth = entry.contentRect.width;
        if (Math.abs(newWidth - lastWidthRef.current) > 1) {
          lastWidthRef.current = newWidth;
          setWidth(newWidth);
        }
      }
    });
    observerRef.current.observe(target);

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  return [nodeRef, width];
}

// =====================================================
// 列宽计算
// =====================================================

/** 根据字段类型计算列最小宽度 */
export function getColumnWidth(col: FormField): number {
  const t = col.type;
  // ERP 数据选择字段和弹窗选择器需要更宽的列
  if (isErpSelectField(col)) return 160;
  switch (t) {
    case 'date': return 130;
    case 'money': return 130;
    case 'number': return 100;
    case 'formula': return 120;
    case 'text': return 150;
    case 'textarea': return 200;
    case 'select':
    case 'tree_select': return 120;
    default: return 120;
  }
}
