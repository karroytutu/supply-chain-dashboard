/**
 * 缓存键常量和 TTL 配置
 */

/** 缓存键常量 */
export const CACHE_KEYS = {
  DASHBOARD_DATA: 'dashboard:overview',
  CATEGORY_TREE: 'category:tree',
  WARNING_LIST: (type: string) => `warning:${type}`,
};

/** 缓存时间常量（毫秒） */
export const CACHE_TTL = {
  DASHBOARD: 60 * 1000,        // Dashboard 数据缓存 1 分钟
  CATEGORY_TREE: 5 * 60 * 1000, // 品类树缓存 5 分钟
  WARNING_LIST: 30 * 1000,     // 预警列表缓存 30 秒
};
