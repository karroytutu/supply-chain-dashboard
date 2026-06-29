/**
 * 可编辑/只读表格列宽动态计算 Hook
 * 基于实际内容测量列宽，以单元格 blur 为触发时机，配合 CSS transition 平滑过渡
 * @module components/Oa/hooks/useColumnWidths
 */
import { useState, useCallback, useEffect, useRef, type RefObject } from 'react';
import type { FormField } from '@/types/oa';
import { isErpSelectField, getColumnWidth } from './useContainerWidth';
import { buildDynamicOptions } from '@/components/Oa/fields/SelectFieldControl';

// =====================================================
// 文本测量（Canvas 2D measureText）
// =====================================================

let _canvas: HTMLCanvasElement | null = null;

/** DOM 未就绪时的降级字体 */
const FALLBACK_FONT = '400 14px system-ui, sans-serif';

/** 测量文字实际像素宽度，font 必须由调用方显式传入（来自 DOM 采样） */
function measureText(text: string, font: string): number {
  if (!text) return 0;
  if (!_canvas) _canvas = document.createElement('canvas');
  const ctx = _canvas.getContext('2d');
  if (!ctx) return text.length * 14; // 降级估算
  ctx.font = font;
  return Math.ceil(ctx.measureText(text).width);
}

/**
 * 从已渲染的表头 <th> 元素读取实际字体参数
 * 返回 CSS font shorthand 字符串，供 Canvas measureText 使用
 */
function captureHeaderFont(containerRef?: RefObject<HTMLElement>): string {
  const th = containerRef?.current?.querySelector('.ant-table-thead th');
  if (th) {
    const s = getComputedStyle(th);
    return `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
  }
  return FALLBACK_FONT;
}

// =====================================================
// 单元格显示文本提取
// =====================================================

/** 根据字段类型提取单元格的显示文本（用于宽度测量） */
function getCellDisplayText(col: FormField, row: Record<string, unknown>): string {
  const value = row[col.key];

  // ERP 选择字段：优先从 nameField 取存储的名称
  // nameField 可能已有值，即使 row[col.key] 尚未就绪也要读取
  if (isErpSelectField(col)) {
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
      // 动态选项：从行数据的 optionsFromField 字段解析标签
      if (col.optionsFromField) {
        const dynamicOpts = buildDynamicOptions(row[col.optionsFromField]);
        if (dynamicOpts) {
          const opt = dynamicOpts.find(o => o.value === value);
          return opt?.label || String(value);
        }
      }
      // 静态选项
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

/** 根据该列实际渲染方式返回额外内边距（px）
 *  逐列判断：disabled 列或整表 readonly → 纯文本 padding；可编辑列 → 按控件类型
 */
function getControlPadding(col: FormField, readonly?: boolean): number {
  if (readonly || col.disabled) return 24; // 该列渲染为纯文本，仅单元格内边距
  const t = col.type;
  if (isErpSelectField(col)) return 80; // ERP 数据选择字段（含控件内边距 + 边框 + measureText 偏差补偿）
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
 * 公式：max(表头宽度, 内容宽度 + 格子内边距, 类型最小宽度)
 * font 来自 DOM 采样，确保测量精度与浏览器渲染一致
 */
function calcColumnWidth(
  col: FormField,
  rows: Record<string, unknown>[],
  isRequired: boolean,
  readonly: boolean | undefined,
  font: string,
): number {
  // 表头宽度（使用真实字体参数，覆盖 font-weight 差异）
  const headerText = col.label + (isRequired ? ' *' : '');
  const headerWidth = measureText(headerText, font) + 16; // 16px = th padding

  // 数据行最大宽度
  let maxDataWidth = 0;
  for (const row of rows) {
    const text = getCellDisplayText(col, row);
    if (text) {
      const w = measureText(text, font);
      if (w > maxDataWidth) maxDataWidth = w;
    }
  }

  const dataWidth = maxDataWidth + getControlPadding(col, readonly);
  // 类型感知最小宽度：确保控件（Select/DatePicker 等）有足够渲染空间
  const typeMinWidth = getColumnWidth(col);
  return Math.max(headerWidth, dataWidth, typeMinWidth);
}

// =====================================================
// Hook
// =====================================================

interface UseColumnWidthsOptions {
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
  containerRef?: RefObject<HTMLElement>,
): UseColumnWidthsResult {
  const isReadonly = options?.readonly ?? false;

  // 从 DOM 表头采样真实字体参数（首次渲染时读取，消除 font-weight 等测量偏差）
  const fontRef = useRef(FALLBACK_FONT);

  const [widths, setWidths] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const col of visibleColumns) {
      initial[col.key] = calcColumnWidth(col, rows, !!col.required, isReadonly, fontRef.current);
    }
    return initial;
  });

  // 用 ref 追踪最新的 rows 和 columns，避免闭包陈旧
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const colsRef = useRef(visibleColumns);
  colsRef.current = visibleColumns;

  const recalcAll = useCallback(() => {
    const font = fontRef.current;
    setWidths(prev => {
      const next: Record<string, number> = {};
      let changed = false;
      for (const col of colsRef.current) {
        const w = calcColumnWidth(col, rowsRef.current, !!col.required, isReadonly, font);
        next[col.key] = w;
        if (Math.abs(w - (prev[col.key] ?? 0)) >= 5) changed = true;
      }
      return changed ? next : prev;
    });
  }, [isReadonly]);

  const recalcColumn = useCallback((colKey: string) => {
    const font = fontRef.current;
    setWidths(prev => {
      const col = colsRef.current.find(c => c.key === colKey);
      if (!col) return prev;
      const w = calcColumnWidth(col, rowsRef.current, !!col.required, isReadonly, font);
      if (Math.abs(w - (prev[colKey] ?? 0)) < 5) return prev; // 差值过小，忽略
      return { ...prev, [colKey]: w };
    });
  }, [isReadonly]);

  // 挂载时采样真实字体并重算（DOM 就绪后 <th> 已渲染）
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      fontRef.current = captureHeaderFont(containerRef);
      recalcAll();
    }
  }, [recalcAll, containerRef]);

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
