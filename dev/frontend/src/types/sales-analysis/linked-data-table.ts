/**
 * 联动明细表通用类型定义
 */

/** 联动筛选状态 */
export interface LinkedFilterState {
  /** 筛选标签文案（如 '明星客户'） */
  label: string;
  /** 筛选函数 */
  filterFn: (record: Record<string, unknown>) => boolean;
}
