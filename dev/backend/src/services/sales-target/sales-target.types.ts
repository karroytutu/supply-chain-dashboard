/**
 * 目标管理模块 - 后端类型定义
 */

/** 品类说明合成行的 goods_name 哨兵值，用于在明细表中存储品类级别的 remark */
export const CATEGORY_REMARK_SENTINEL = '__category_remark__';

/** 目标审批状态 */
export type TargetApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected';

/** 目标主表实体（snake_case，与数据库一致） */
export interface SalesTarget {
  id: number;
  marketer_id: number;
  year: number;
  month: number;
  status: TargetApprovalStatus;
  oa_instance_id: number | null;
  created_at: string;
  updated_at: string;
}

/** 目标明细实体 */
export interface SalesTargetItem {
  id: number;
  target_id: number;
  erp_consumer_id: number | null;
  consumer_name: string;
  is_planned_new: boolean;
  erp_goods_id: number | null;
  goods_name: string;
  category_name: string | null;
  unit: string | null;
  unit_price: number | null;
  target_amount: number;
  remark: string;
  created_at: string;
}

/** 创建/更新目标的请求参数 */
export interface SaveTargetParams {
  marketer_id: number;
  year: number;
  month: number;
  items: SaveTargetItemParams[];
}

/** 目标明细行参数 */
export interface SaveTargetItemParams {
  erp_consumer_id: number | null;
  consumer_name: string;
  is_planned_new: boolean;
  erp_goods_id: number | null;
  goods_name: string;
  category_name: string | null;
  unit: string | null;
  unit_price: number | null;
  target_amount: number;
  remark: string;
}

/** 目标详情（含明细，按客户→品类→商品树形组织） */
export interface TargetDetailDTO {
  id: number;
  marketer_id: number;
  marketer_name: string;
  year: number;
  month: number;
  status: TargetApprovalStatus;
  oa_instance_id: number | null;
  created_at: string;
  updated_at: string;
  customers: TargetCustomerDTO[];
}

/** 目标客户 DTO */
export interface TargetCustomerDTO {
  erp_consumer_id: number | null;
  consumer_name: string;
  is_planned_new: boolean;
  categories: TargetCategoryDTO[];
}

/** 目标品类 DTO */
export interface TargetCategoryDTO {
  category_name: string;
  target_amount: number;
  actual_amount_last_month: number;
  actual_amount_prev_month: number;
  products: TargetProductDTO[];
}

/** 目标商品 DTO */
export interface TargetProductDTO {
  erp_goods_id: number | null;
  goods_name: string;
  unit: string | null;
  unit_price: number | null;
  target_amount: number;
  remark: string;
  actual_amount_last_month: number;
  actual_amount_prev_month: number;
  gross_margin_rate: number;
}

/** 客户列表 DTO（含公海标记 + 归属标记） */
export interface CustomerListDTO {
  erp_consumer_id: number;
  consumer_name: string;
  consumer_manager_name: string | null;
  channel_name: string | null;
  area_name: string | null;
  cooperation_type_name: string | null;
  is_public_sea: boolean;
  is_mine: boolean;
}

/** ERP 商品目录 DTO（按品类分组） */
export interface ProductCatalogDTO {
  category_name: string;
  products: ProductItemDTO[];
}

/** 商品项 DTO */
export interface ProductItemDTO {
  erp_goods_id: number;
  goods_name: string;
  unit: string;
  unit_price: number | null;
  brand_name: string | null;
  has_stock: boolean;
}

/** 历史销售数据 DTO */
export interface HistoricalSalesDTO {
  erp_consumer_id: number;
  consumer_name: string;
  erp_goods_id: number;
  goods_name: string;
  actual_amount_last_month: number;
  actual_amount_prev_month: number;
  gross_margin_rate: number;
}

/** 初始化数据 DTO（完整的目标视图，含已保存目标或 ERP 初始数据） */
export interface InitDataDTO {
  /** 是否来自已保存的目标记录 */
  is_saved: boolean;
  /** 目标 ID（如果已保存） */
  target_id: number | null;
  /** 目标审批状态 */
  status: TargetApprovalStatus;
  /** 关联的 OA 审批实例 ID */
  oa_instance_id: number | null;
  /** 营销师 ID */
  marketer_id: number;
  /** 营销师姓名 */
  marketer_name: string;
  /** 年份 */
  year: number;
  /** 月份 */
  month: number;
  /** 客户数据 */
  customers: TargetCustomerDTO[];
}

/** 概览汇总 DTO */
export interface OverviewDTO {
  summary: {
    total_target: number;
    total_last_month_actual: number;
    growth_rate: number | null;
    marketer_count: number;
    marketers_with_target: number;
    target_customer_count: number;
    last_month_customer_count: number;
    target_sku_count: number;
    last_month_sku_count: number;
    target_category_count: number;
    last_month_category_count: number;
    avg_customer_value: number;
    last_month_avg_customer_value: number;
    total_estimated_gross_profit: number;
    total_base_commission: number;
    total_increment_commission: number;
  };
  marketers: MarketerOverviewDTO[];
}

/** 单个营销师概览 DTO */
export interface MarketerOverviewDTO {
  id: number;
  name: string;
  target_amount: number;
  last_month_actual: number;
  growth_rate: number | null;
  has_saved: boolean;
  /** 目标审批状态（null 表示未制定） */
  target_status: TargetApprovalStatus | null;
  customer_count: number;
  last_month_customer_count: number;
  sku_count: number;
  last_month_sku_count: number;
  category_count: number;
  last_month_category_count: number;
  avg_customer_value: number;
  last_month_avg_customer_value: number;
  estimated_gross_profit: number;
  last_month_gross_profit: number;
  base_commission: number;
  increment_commission: number;
}

/** 目标列表查询参数 */
export interface TargetListQuery {
  marketer_id?: number;
  year?: number;
  month?: number;
  status?: TargetApprovalStatus;
}

/** 概览服务内部类型：员工销售汇总（内部计算用，不经过 toCamelKeys） */
export interface StaffSales {
  amount: number;
  costAmount: number;
  customerCount: number;
  goodsIds: Set<number>;
  categoryNames: Set<string>;
}

/** 概览服务内部类型：已保存目标信息（内部计算用，不经过 toCamelKeys） */
export interface SavedTargetInfo {
  totalAmount: number;
  customerIds: Set<number>;
  skuIds: Set<number>;
  categoryNames: Set<string>;
  estimatedGrossProfit: number;
}
