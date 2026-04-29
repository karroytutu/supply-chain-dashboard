/**
 * 缓存键常量
 * 格式：{业务域}:{实体}:{操作/条件}
 * @description 所有缓存key必须使用此文件中的常量，禁止硬编码字符串
 */

// ==================== 概览相关 ====================
export const CACHE_KEY = {
  /** 概览趋势数据 */
  OVERVIEW_TREND: (days: number) => `overview:trend:${days}` as const,
  /** 概览统计 */
  OVERVIEW_STATS: 'overview:stats:summary' as const,

  // ==================== 战略商品相关 ====================
  /** 战略商品ID集合 */
  STRATEGIC_PRODUCT_IDS: 'strategic:product:ids' as const,
  /** 战略商品列表 */
  STRATEGIC_PRODUCT_LIST: 'strategic:product:list' as const,

  // ==================== 催收相关 ====================
  /** 催收任务列表 */
  AR_COLLECTION_TASKS: 'ar:collection:tasks' as const,
  /** 催收统计 */
  AR_COLLECTION_STATS: 'ar:collection:stats' as const,

  // ==================== 权限相关 ====================
  /** 用户权限缓存 */
  PERMISSION_USER: (userId: number) => `permission:user:${userId}` as const,
  /** 权限树缓存 */
  PERMISSION_TREE: 'permission:tree:full' as const,

  // ==================== 客户相关 ====================
  /** 客户搜索缓存 */
  ERP_CUSTOMER_SEARCH: (keyword: string) => `erp:customer:search:${keyword}` as const,
  /** 客户详情缓存 */
  ERP_CUSTOMER_PROFILE: (customerId: string | number) => `erp:customer:profile:${customerId}` as const,
  /** 客户名称映射 */
  CUSTOMER_NAME_MAP: 'erp:customer:debt-name-map' as const,
  /** 客户额度映射 */
  CUSTOMER_LIMITS: 'erp:customer:limits' as const,
  /** 结算单囤货标记 */
  SETTLEMENT_HOARD: (traderId: string) => `erp:settlement:hoard:${traderId}` as const,

  // ==================== 品类相关 ====================
  /** 品类统计 */
  CATEGORY_STATS: 'category:stats:summary' as const,

  // ==================== 仪表盘相关 ====================
  /** 仪表盘概览 */
  DASHBOARD_OVERVIEW: 'dashboard:overview' as const,

  // ==================== 退货单相关 ====================
  /** 退货单列表前缀 */
  RETURN_ORDER_PREFIX: 'return:order' as const,

  // ==================== 战略商品仓库前缀 ====================
  /** 战略商品仓库前缀 */
  STRATEGIC_PRODUCT_PREFIX: 'strategic:product' as const,

  // ==================== 催收仓库前缀 ====================
  /** 催收仓库前缀 */
  AR_COLLECTION_PREFIX: 'ar:collection' as const,
} as const;
