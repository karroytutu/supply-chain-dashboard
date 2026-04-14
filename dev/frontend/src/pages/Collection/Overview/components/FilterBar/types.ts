/**
 * FilterBar 组件类型定义
 * 简化版：仅保留搜索、处理人、日期筛选
 */

import type { Dayjs } from 'dayjs';

/** 处理人信息 */
export interface Handler {
  id: number;
  name: string;
}

/** 筛选状态接口 */
export interface FilterState {
  searchKeyword: string;
  handlerId: number | null;
  dateRange: [Dayjs | null, Dayjs | null] | null;
}

/** FilterBar 组件 Props */
export interface FilterBarProps {
  // 筛选状态
  searchKeyword: string;
  handlers: Handler[];
  selectedHandlerId: number | null;
  dateRange: [Dayjs | null, Dayjs | null] | null;

  // 回调函数
  onSearch: (keyword: string) => void;
  onHandlerChange: (handlerId: number | null) => void;
  onDateRangeChange: (range: [Dayjs | null, Dayjs | null] | null) => void;
  onClearAll: () => void;
  isMobile?: boolean;
  isAdmin?: boolean;
}
