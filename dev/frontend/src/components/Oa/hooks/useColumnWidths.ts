/**
 * 可编辑/只读表格列宽动态计算 Hook
 * 基于实际内容测量列宽，以单元格 blur 为触发时机，配合 CSS transition 平滑过渡
 * @module components/Oa/hooks/useColumnWidths
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import type { FormField } from '@/types/oa';
import { TABLE_ERP_TYPES } from './useContainerWidth';
import { getColumnWidth } from './useContainerWidth';

// =====================================================
// 文本测量（Canvas 2D measureText）
// =====================================================

let _canvas: HTMLCanvasElement | null = null;

/** 测量文字实际像素宽度（模块级缓存 Canvas 实例） */
function measureText(text: string, font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'): number {
  if (!text) return 0;
  if (!_canvas) _canvas = document.createElement('canvas');
  const ctx = _canvas.getContext('2d');
  if (!ctx) return text.length * 14; // 降级估算
  ctx.font = font;
  return Math.ceil(ctx.measureText(text).width);
}

// =====================================================
// 单元格显示文本提取
// =====================================================

/** 根据字段类型提取单元格的显示文本（用于宽度测量） */
function getCellDisplayText(col: FormField, row: Record<string, unknown>): string {
  const value = row[col.key];

  // modal_select / erp_* 类型：优先从 nameField 取存储的名称
  // nameField 可能已有值，即使 row[col.key] 尚未就绪也要读取
  if (TABLE_ERP_TYPES.has(col.type)) {
    if (col.nameField) {
      const nameVal = row[col.nameField];
      if (nameVal != null && nameVal !== '') return String(nameVal);
    }
    if (value == null || value === '') return '';
    // 无 nameField 时，尝试从 labelKey 在行数据中取值
    if (col.labelKey && typeof value === 'object' && value !== null) {
      return String((value as Record<string, unknown>)[col.labelKey] || '');
    }
    // 最终降级：用 placeholder 文本作为测量基准
    return col.searchPlaceholder || col.label;
  }

  if (value == null || value === '') return '';

  switch (col.type) {
    case 'money': {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    case 'number': {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      const precision = col.precision ?? 0;
      return num.toLocaleString('zh-CN', {
        minimumFractionDigits: precision,
        maximumFractionDigits: precision,
      });
    }
    case 'select': {
      const option = col.options?.find(o => o.value === value);
      return option?.label || String(value);
    }
    case 'formula': {
      const num = Number(value);
      if (isNaN(num)) return String(value);
      const precision = col.formulaPrecision ?? 2;
      return num.toLocaleString('zh-CN', {
        minimumFractionDigits: precision,
        maximumFractionDigits: precision,
      });
    }
    case 'date':
      return String(value).slice(0, 10); // YYYY-MM-DD
    case 'text':
    case 'textarea':
    default:
      return String(value);
  }
}

// =====================================================
// 控件内边距
// =====================================================

/** 根据控件类型返回额外内边距（px）；只读模式下统一使用纯文本 padding */
function getControlPadding(col: FormField, readonly?: boolean): number {
  if (readonly) return 24; // 纯文本渲染，仅单元格内边距
  const t = col.type;
  if (TABLE_ERP_TYPES.has(t)) return 80; // Select 控件（含下拉箭头 + 内边距 + 边框 + measureText 偏差补偿）
  switch (t) {
    case 'number': return 32; // InputNumber 含步进按钮
    case 'money': return 24;
    case 'select': return 48; // 含下拉箭头 + 内边距
    case 'date': return 28; // DatePicker 含图标
    case 'formula': return 16; // disabled InputNumber
    case 'text':
    case 'textarea':
    default: return 24; // Input padding
  }
}

// =====================================================
// 单列宽度计算
// =====================================================

/**
 * 计算单列的理想宽度
 * 以 getColumnWidth 作为类型最小宽度下限（控件本身的合理最小尺寸），
 * 再取表头和所有行内容测量宽度的最大值，确保列宽始终不低于控件类型下限
 */
function calcColumnWidth(
  col: FormField,
  rows: Record<string, unknown>[],
  isRequired: boolean,
  minWidth: number,
  readonly?: boolean,
): number {
  // 类型最小宽度下限（由控件类型决定，如 select=120、number=100）
  const typeMinWidth = readonly ? minWidth : getColumnWidth(col);

  // 表头宽度
  const headerText = col.label + (isRequired ? ' *' : '');
  const headerWidth = measureText(headerText) + 16; // 16px = th padding

  // 数据行最大宽度
  let maxDataWidth = 0;
  for (const row of rows) {
    const text = getCellDisplayText(col, row);
    if (text) {
      const w = measureText(text);
      if (w > maxDataWidth) maxDataWidth = w;
    }
  }

  const dataWidth = maxDataWidth + getControlPadding(col, readonly);
  return Math.max(headerWidth, dataWidth, typeMinWidth, minWidth);
}

// =====================================================
// Hook
// =====================================================

interface UseColumnWidthsOptions {
  /** 列最小宽度（px），默认 60 */
  minColumnWidth?: number;
  /** 只读模式：使用纯文本 padding，跳过控件类型最小宽度 */
  readonly?: boolean;
}

interface UseColumnWidthsResult {
  /** 当前各列宽度映射（colKey → px） */
  widths: Record<string, number>;
  /** 触发单列重算（blur 时调用） */
  recalcColumn: (colKey: string) => void;
  /** 全列重算（挂载 / 新增行时调用） */
  recalcAll: () => void;
}

/**
 * 可编辑表格列宽动态计算
 *
 * - 挂载时根据初始数据计算所有列宽
 * - blur 时重算指定列（扫描全列取最大内容宽度）
 * - 新旧宽度差值 < 5px 时忽略，避免无意义 re-render
 * - 配合 CSS transition 实现平滑过渡
 */
export function useColumnWidths(
  visibleColumns: FormField[],
  rows: Record<string, unknown>[],
  options?: UseColumnWidthsOptions,
): UseColumnWidthsResult {
  const minWidth = options?.minColumnWidth ?? 60;
  const isReadonly = options?.readonly ?? false;

  const [widths, setWidths] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const col of visibleColumns) {
      initial[col.key] = calcColumnWidth(col, rows, !!col.required, minWidth, isReadonly);
    }
    return initial;
  });

  // 用 ref 追踪最新的 rows 和 columns，避免闭包陈旧
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const colsRef = useRef(visibleColumns);
  colsRef.current = visibleColumns;

  const recalcAll = useCallback(() => {
    setWidths(prev => {
      const next: Record<string, number> = {};
      let changed = false;
      for (const col of colsRef.current) {
        const w = calcColumnWidth(col, rowsRef.current, !!col.required, minWidth, isReadonly);
        next[col.key] = w;
        if (Math.abs(w - (prev[col.key] ?? 0)) >= 5) changed = true;
      }
      return changed ? next : prev;
    });
  }, [minWidth, isReadonly]);

  const recalcColumn = useCallback((colKey: string) => {
    setWidths(prev => {
      const col = colsRef.current.find(c => c.key === colKey);
      if (!col) return prev;
      const w = calcColumnWidth(col, rowsRef.current, !!col.required, minWidth, isReadonly);
      if (Math.abs(w - (prev[colKey] ?? 0)) < 5) return prev; // 差值过小，忽略
      return { ...prev, [colKey]: w };
    });
  }, [minWidth, isReadonly]);

  // 挂载时计算初始宽度（确保 DOM 就绪后测量）
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      recalcAll();
    }
  }, [recalcAll]);

  // 行数变化时自动重算所有列宽（新增/删除行后确保宽度自适应）
  // recalcAll 内部通过 rowsRef 读取最新数据，且有 >=5px 变化阈值保护，不会多余 re-render
  const rowCount = rows.length;
  useEffect(() => {
    if (mountedRef.current) {
      // 延迟到下一帧确保父组件已完成 re-render，rowsRef 已更新
      requestAnimationFrame(recalcAll);
    }
  }, [rowCount, recalcAll]);

  return { widths, recalcColumn, recalcAll };
}
