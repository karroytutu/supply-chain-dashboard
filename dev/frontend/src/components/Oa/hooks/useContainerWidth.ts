/**
 * 表格布局共享工具模块
 * 提供容器宽度监听、列宽计算、表格样式常量
 * 供 FormFieldRenderer（只读表格）和 TableFieldRenderer（可编辑表格）共用
 */
import React, { useRef, useState, useCallback } from 'react';
import type { FormField } from '@/types/oa';

// =====================================================
// ERP 数据选择字段识别
// =====================================================

/** 判断是否为 ERP 数据选择字段（通过 searchApi 配置识别） */
export function isErpSelectField(col: FormField): boolean {
  return col.type === 'select' && !!col.searchApi;
}

/** 弹窗选择器类型（表格行内降级为 Select 搜索框） */
export const MODAL_SELECT_TYPE = 'modal_select';

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
 */
export function useContainerWidth(): [React.RefCallback<HTMLDivElement>, number] {
  const [width, setWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 800)); // SSR 安全的初始值，减少首帧宽度跳动
  const observerRef = useRef<ResizeObserver | null>(null);
  const lastWidthRef = useRef(0);

  const ref = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (node) {
      // 观察父元素而非自身，断开测量→渲染→测量的反馈循环
      const target = node.parentElement || node;
      const initialWidth = target.clientWidth || 800;
      lastWidthRef.current = initialWidth;
      setWidth(initialWidth);
      observerRef.current = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry) {
          const newWidth = entry.contentRect.width;
          // 1px 容差，避免亚像素渲染差异导致无意义的 re-render
          if (Math.abs(newWidth - lastWidthRef.current) > 1) {
            lastWidthRef.current = newWidth;
            setWidth(newWidth);
          }
        }
      });
      observerRef.current.observe(target);
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
  // ERP 数据选择字段和弹窗选择器需要更宽的列
  if (isErpSelectField(col) || t === MODAL_SELECT_TYPE) return 160;
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
