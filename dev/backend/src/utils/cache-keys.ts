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
  ERP_CUSTOMER_PROFILE: (customerId: string | number) =>
    `erp:customer:profile:${customerId}` as const,
  /** 客户搜索缓存前缀（用于 invalidate 批量清除） */
  ERP_CUSTOMER_SEARCH_PREFIX: 'erp:customer:search' as const,
  /** 客户详情缓存前缀（用于 invalidate 批量清除） */
  ERP_CUSTOMER_PROFILE_PREFIX: 'erp:customer:profile:' as const,
  /** 客户等级列表 */
  ERP_CUSTOMER_GRADES: 'erp:customer:grades' as const,
  /** 客户渠道列表 */
  ERP_CUSTOMER_GROUPS: 'erp:customer:groups' as const,
  /** 客户片区列表 */
  ERP_CUSTOMER_AREAS: 'erp:customer:areas' as const,
  /** 客户片区树形结构 */
  ERP_CUSTOMER_AREAS_TREE: 'erp:customer:areas-tree' as const,
  /** 品牌列表 */
  ERP_BRANDS: 'erp:brands' as const,
  /** 客户欠款总额（按客户ID） */
  ERP_CUSTOMER_DEBT_TOTAL: (customerId: number) => `erp:customer:debt-total:${customerId}` as const,
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

  // ==================== ERP 数据源缓存（API 迁移后使用） ====================
  /** 客户欠款明细全量数据 */
  ERP_DEBTS_ALL: 'erp:debts:all' as const,
  /** 商品档案全量数据 */
  ERP_PRODUCTS_ALL: 'erp:products:all' as const,
  /** 实时库存全量数据 */
  ERP_INVENTORY_ALL: 'erp:inventory:all' as const,
  /** 销售明细-近期（近7天） */
  ERP_SALES_RECENT: 'erp:sales:recent' as const,
  /** 日均销量汇总 Map（商品名 → 日均数量） */
  ERP_SALES_DAILY_MAP: 'erp:sales:daily:map' as const,
  /** 销售明细-历史（8-30天前） */
  ERP_SALES_HISTORY: 'erp:sales:history' as const,
  /** 批次库存全量数据 */
  ERP_BATCH_INVENTORY: 'erp:batch:inventory' as const,
  /** 库存快照月度数据 */
  ERP_SNAPSHOT: (month: string) => `erp:snapshot:${month}` as const,
  /** 库存成本月度汇总 */
  ERP_STOCK_COST: (month: string) => `erp:stock:cost:${month}` as const,
  /** 销售明细-最后销售日期 */
  ERP_SALES_LAST_SALE: 'erp:sales:last_sale' as const,

  // ==================== ERP 聚合层缓存（Facade 结果缓存） ====================
  /** 商品+库存 JOIN 结果 */
  ERP_FACADE_PRODUCTS_WITH_STOCK: 'erp:facade:products_with_stock' as const,
  /** 品类聚合结果 */
  ERP_FACADE_CATEGORY_AGG: 'erp:facade:category_agg' as const,

  // ==================== 应收看板相关 ====================
  /** 应收看板聚合数据 */
  AR_DASHBOARD_OVERVIEW: 'ar:dashboard:overview' as const,
  /** 应收看板即将逾期弹窗 */
  AR_DASHBOARD_UPCOMING_EXPIRY: 'ar:dashboard:upcoming-expiry' as const,
  /** 应收看板管道即将逾期弹窗 */
  AR_DASHBOARD_PIPELINE_EXPIRY: (s: string, l?: number) =>
    `ar:dashboard:pipeline-expiry:${s}:${l ?? 0}` as const,
  /** 应收看板诉讼进度明细 */
  AR_DASHBOARD_LEGAL_PROGRESS: (category: string) =>
    `ar:dashboard:legal-progress:${category}` as const,
  /** 应收看板管道超时明细 */
  AR_DASHBOARD_PIPELINE_TIMEOUT: (s: string, l?: number) =>
    `ar:dashboard:pipeline-timeout:${s}:${l ?? 0}` as const,

  // ==================== 工作台相关 ====================
  /** 工作台聚合数据（按用户） */
  WORKSPACE_DATA: (userId: number) => `workspace:data:${userId}` as const,

  // ==================== ERP 数据源缓存前缀（用于 invalidate 批量清除） ====================
  /** 实时库存缓存前缀 */
  ERP_INVENTORY_PREFIX: 'erp:inventory' as const,
  /** 销售明细缓存前缀 */
  ERP_SALES_PREFIX: 'erp:sales' as const,
  /** 库存快照缓存前缀 */
  ERP_SNAPSHOT_PREFIX: 'erp:snapshot' as const,
  /** 批次库存缓存前缀 */
  ERP_BATCH_PREFIX: 'erp:batch' as const,
  /** 数据聚合层缓存前缀 */
  ERP_FACADE_PREFIX: 'erp:facade' as const,
  /** 商品档案缓存前缀 */
  ERP_PRODUCTS_PREFIX: 'erp:products' as const,

  // ==================== 采购审批相关 ====================
  /** 日均销售报表缓存（按商品ID集合哈希） */
  ERP_PURCHASE_DAILY_SALE: (hash: string) => `erp:purchase:daily-sale:${hash}` as const,
  /** 供应商列表缓存（按关键词区分） */
  ERP_PURCHASE_SUPPLIERS: (keyword: string) => `erp:purchase:suppliers:${keyword}` as const,
  /** 供应商全量加载统一缓存（避免逐页缓存碎片） */
  ERP_PURCHASE_SUPPLIERS_ALL: 'erp:purchase:suppliers:all' as const,
  /** 商品成本价映射缓存（从库存数据延迟构建） */
  ERP_PRODUCT_COST_PRICE_MAP: 'erp:product:costPriceMap' as const,

  // ==================== OA 表单类型相关 ====================
  /** OA 表单类型列表（全量） */
  OA_FORM_TYPES_ACTIVE: 'oa:form-types:active' as const,
  /** OA 表单类型前缀（用于 invalidate 批量清除） */
  OA_FORM_TYPES_PREFIX: 'oa:form-types' as const,

  // ==================== 供应商收入类别 ====================
  /** 供应商收入类别列表（展平后的叶子节点） */
  ERP_INCOME_CATEGORIES_SUPPLIER: 'erp:income:categories:supplier' as const,
} as const;
