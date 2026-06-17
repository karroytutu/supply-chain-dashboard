/**
 * 业务常量定义
 * 集中管理供应链仪表盘中的业务阈值和配置
 */

// ==================== 周转相关阈值 ====================

/** 周转天数 - 优秀阈值（天数） @usedBy overview.service.ts, frontend/warning.ts */
export const TURNOVER_EXCELLENT_DAYS = 15;

/** 周转天数 - 良好阈值（天数） @usedBy overview.service.ts, frontend/warning.ts */
export const TURNOVER_GOOD_DAYS = 30;

/** 周转天数 - 关注阈值（天数） @usedBy overview.service.ts, frontend/warning.ts */
export const TURNOVER_ATTENTION_DAYS = 45;

/** 标准计算周期（天数） */
export const STANDARD_CALC_DAYS = 30;

// ==================== 库存积压阈值 ====================

/** 积压 - 轻度阈值（可售天数 > 60天） */
export const OVERSTOCK_MILD_DAYS = 60;

/** 积压 - 中度阈值（可售天数 > 90天） */
export const OVERSTOCK_MODERATE_DAYS = 90;

/** 积压 - 严重阈值（可售天数 > 120天） */
export const OVERSTOCK_SERIOUS_DAYS = 120;

// ==================== 低库存阈值 ====================

/** 低库存阈值（可售天数 <= 15天） */
export const LOW_STOCK_DAYS = 15;

// ==================== 临期阈值 ====================

/** 临期 - 严重预警（7天内） @usedBy expiring-warning.service.ts, frontend/warning.ts */
export const EXPIRING_SERIOUS_DAYS = 7;

/** 临期 - 警告（15天内） @usedBy expiring-warning.service.ts, frontend/warning.ts */
export const EXPIRING_WARNING_DAYS = 15;

/** 临期 - 关注（30天内） @usedBy expiring-warning.service.ts, frontend/warning.ts */
export const EXPIRING_ATTENTION_DAYS = 30;

/** 临期阈值配置（基于保质期） */
export const EXPIRING_THRESHOLDS = {
  /** 保质期 <= 90天：临期阈值30天 */
  SHORT_SHELF_LIFE: { maxShelfLife: 90, threshold: 30 },
  /** 保质期 91-150天：临期阈值45天 */
  MEDIUM_SHELF_LIFE: { minShelfLife: 91, maxShelfLife: 150, threshold: 45 },
  /** 保质期 151-270天：临期阈值60天 */
  LONG_SHELF_LIFE: { minShelfLife: 151, maxShelfLife: 270, threshold: 60 },
  /** 保质期 >= 271天：临期阈值90天 */
  VERY_LONG_SHELF_LIFE: { minShelfLife: 271, threshold: 90 },
} as const;

// ==================== 滞销阈值 ====================

/** 滞销 - 轻度阈值（未销售天数 > 7天） */
export const SLOW_MOVING_MILD_DAYS = 7;

/** 滞销 - 中度阈值（未销售天数 > 15天） */
export const SLOW_MOVING_MODERATE_DAYS = 15;

/** 滞销 - 严重阈值（未销售天数 > 30天） */
export const SLOW_MOVING_SERIOUS_DAYS = 30;

/**
 * 滞销分析-最后销售回溯天数（最大滞销阈值30天 + 50%缓冲）
 * getLastSaleMap() 查询范围：超出此范围的商品视为严重滞销
 * @usedBy erp-sales-detail.service.ts (getLastSaleMap)
 */
export const LAST_SALE_LOOKBACK_DAYS = 45;

// ==================== 预警级别阈值 ====================

/** 临期率 - 严重预警阈值（%） @usedBy overview.service.ts, frontend/warning.ts */
export const EXPIRING_RATE_SERIOUS = 5;

/** 临期率 - 警告阈值（%） @usedBy overview.service.ts, frontend/warning.ts */
export const EXPIRING_RATE_WARNING = 3;

/** 临期率 - 关注阈值（%） @usedBy overview.service.ts, frontend/warning.ts */
export const EXPIRING_RATE_ATTENTION = 1;

// ==================== 角色编码 ====================

/** 管理角色编码（用于权限判断和角色映射）
 * @usedBy oa/ar-collection-callback.ts, assessment/rules/oa-collection-node-rules.ts
 */
export const ROLE_CODES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  MARKETER: 'marketer',
  MARKETING_MANAGER: 'marketing_manager',
  /** @deprecated 历史遗留角色编码，兼容读取时按 MARKETING_MANAGER 处理 */
  MARKETING_SUPERVISOR: 'marketing_supervisor',
  CURRENT_ACCOUNTANT: 'current_accountant',
  FINANCE_STAFF: 'finance_staff',
  CASHIER: 'cashier',
} as const;

/** 可查看催收全量数据的角色列表 */
export const MANAGER_ROLES = [
  ROLE_CODES.ADMIN,
  ROLE_CODES.MANAGER,
  ROLE_CODES.MARKETING_MANAGER,
  ROLE_CODES.MARKETING_SUPERVISOR,
] as const;

// ==================== 催收相关阈值 ====================

/** 催收延期最大天数 @usedBy oa/ar-collection-callback.ts (校验延期天数), config.controller.ts */
export const AR_EXTENSION_MAX_DAYS = 30;

/** 催收默认到期天数 @usedBy ar-warning.query.ts, ar-warning.task.ts, oa/ar-collection-creator.ts */
export const AR_DEFAULT_EXPIRE_DAYS = 7;

/** 结算方式-消费者到期标识 @usedBy ar-warning.query.ts, ar-warning.task.ts, erp-debt/erp-debt-enrichment.service.ts, oa/ar-collection-creator.ts */
export const AR_SETTLE_METHOD_CONSUMER_EXPIRE = 2;

/** 催收考核起效日期 @usedBy config.controller.ts (通过配置接口暴露给前端) */
export const AR_ASSESSMENT_EFFECTIVE_DATE = '2026-04-23';

/** 催收压单标记-正常 @usedBy erp-debt/erp-debt-enrichment.service.ts */
export const AR_HOARD_TAG_NORMAL = 'NORMAL';

/** 催收压单标记-压单 @usedBy erp-debt/erp-debt-enrichment.service.ts */
export const AR_HOARD_TAG_HOARD = 'HOARD';

/** 催收明细压单排除状态 @usedBy erp-debt/erp-hoard-detect.ts (标记压单排除明细) */
export const AR_DETAIL_STATUS_HOARD_EXCLUDED = 'hoard_excluded';

/** 压单类型-长期压单 @usedBy erp-debt/erp-hoard-detect.ts, erp-debt/erp-debt-enrichment.service.ts, oa/customer-credit-callback.ts */
export const AR_HOLD_TYPE_LONG_TERM = 'long_term';

/** 压单类型-期限压单 @usedBy erp-debt/erp-hoard-detect.ts, erp-debt/erp-debt-enrichment.service.ts, erp-debt/erp-debt-sync.task.ts, oa/customer-credit-callback.ts */
export const AR_HOLD_TYPE_TIME_LIMITED = 'time_limited';

/** 压单类型联合 @usedBy erp-debt/erp-debt.types.ts, erp-debt/erp-debt-enrichment.service.ts */
export type ArHoldType = typeof AR_HOLD_TYPE_LONG_TERM | typeof AR_HOLD_TYPE_TIME_LIMITED;

// ==================== 退货考核阈值 ====================

/** 退货时保质期不足阈值（天） @usedBy return-penalty-calculate.ts (判断退货考核规则) */
export const RETURN_EXPIRE_INSUFFICIENT_DAYS = 15;

// ==================== ERP 配置 ====================

/** ERP 独山云仓仓库 ID @usedBy erp-batch-inventory.service.ts (默认拉取批次库存的仓库) */
export const ERP_DUSHAN_WAREHOUSE_ID = 17;

// ==================== 缓存时间配置 ====================

/** 战略商品缓存过期时间 @usedBy warning-cache.ts (战略商品ID缓存) */
export const CACHE_TTL_STRATEGIC_PRODUCT = 5 * 60 * 1000;

/** 权限缓存过期时间 @usedBy permission-cache.service.ts (权限缓存) */
export const CACHE_TTL_PERMISSION = 30 * 1000;

/** OA 钉钉流程模板 processCode 缓存过期时间 @usedBy oa-process-centre.ts (模板缓存) */
export const CACHE_TTL_OA_PROCESS_CODE = 5 * 60 * 1000;

// ==================== 客户授信审批阈值 ====================

/**
 * OA auto 节点卡住判定阈值（毫秒）
 * 超过此时间的 processing 状态视为卡住，由定时任务或启动恢复处理
 * @usedBy erp-meta-utils.ts (卡住任务恢复)
 */
export const OA_AUTO_NODE_STUCK_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * OA auto 节点前端轮询间隔（毫秒）
 * @usedBy useAutoNodePolling.ts (轮询间隔)
 */
export const OA_AUTO_NODE_POLL_INTERVAL_MS = 2000;

/** 客户授信审批通过后设置的结算方式值（挂账）
 * 与 AR_SETTLE_METHOD_CONSUMER_EXPIRE 值相同(=2)，但语义不同：
 * 此处表示"授信后应设为挂账"，AR_SETTLE_METHOD_CONSUMER_EXPIRE 表示"挂账客户使用 consumerExpireDay"
 * @usedBy customer-credit-callback.ts, erp-credit-update.service.ts
 */
export const CREDIT_SETTLE_METHOD_ON_ACCOUNT = 2;

/** 客户授信-营业执照补交时限(天)
 * @usedBy customer-credit-callback.ts (计算补交截止日期)
 * @usedBy credit-license-reminder.task.ts (查询待提醒记录)
 * @usedBy credit-license-rules.ts (判断是否超期)
 */
export const CREDIT_LICENSE_DEFERRED_DEADLINE_DAYS = 7;

/** 客户授信-营业执照补交第3天提醒偏移(天)
 * @usedBy credit-license-reminder.task.ts (第3天提醒判断)
 */
export const CREDIT_LICENSE_REMINDER_DAY_OFFSET_1 = 3;

/** 客户授信-营业执照补交到期前1天提醒偏移(天)
 * @usedBy credit-license-reminder.task.ts (到期前1天提醒判断)
 */
export const CREDIT_LICENSE_REMINDER_DAY_OFFSET_2 = 6;

/** 客户授信-营业执照补交逾期每日考核金额(元)
 * @usedBy credit-license-rules.ts (每日考核金额)
 */
export const CREDIT_LICENSE_PENALTY_PER_DAY = 10;

// ==================== 客户档案修改 ====================

/** 允许提交客户档案修改申请的角色
 * @usedBy customer-modify-callback.ts (beforeSubmit 角色校验)
 */
export const CUSTOMER_MODIFY_ALLOWED_ROLES = ['admin', 'marketer', 'marketing_manager'];

/** 客户状态：启用
 * @usedBy customer-modify-callback.ts (状态判断)
 */
export const CUSTOMER_STATE_ENABLED = 1;

/** 客户状态：停用
 * @usedBy customer-modify-callback.ts (停用校验)
 */
export const CUSTOMER_STATE_DISABLED = 0;

/** 客户状态：待确认
 * @usedBy customer-modify.ts (表单选项)
 * @usedBy customer-modify-callback.ts (状态处理)
 */
export const CUSTOMER_STATE_PENDING = 2;

// ==================== OA钉钉通知配置 ====================

/** OA通知中表单摘要最大字段数 @usedBy oa-dingtalk.ts (表单摘要提取) */
export const OA_NOTIFICATION_FORM_SUMMARY_MAX_FIELDS = 5;

/** OA钉钉通知状态栏映射 @usedBy oa-notify.ts (状态栏更新) */
export const OA_DINGTALK_STATUS = {
  APPROVED: { value: '已通过', bg: '#52C41A' },
  REJECTED: { value: '已拒绝', bg: '#F5222D' },
  WITHDRAWN: { value: '已撤回', bg: '#999999' },
  CC: { value: '抄送', bg: '#1890FF' },
} as const;

// ==================== OA流程中心ProcessCentre相关常量 ====================

/**
 * 钉钉流程中心壳模板名称前缀
 * 模板命名格式：{前缀}-{表单类型名}，如 "鑫链云-其他付款申请"
 * @usedBy oa-process-centre.ts (创建/更新壳模板)
 */
export const DINGTALK_PROCESS_TEMPLATE_PREFIX = '鑫链云';

/**
 * 流程中心 activityId 分隔符
 * activityId 格式：{instanceId}:node{nodeOrder}，同一节点含加签人共享同一 activityId
 * @usedBy oa-process-centre.ts
 */
export const OA_PC_ACTIVITY_ID_SEPARATOR = ':';

// ==================== 工具函数 ====================

/**
 * 根据保质期获取临期阈值天数
 */
export function getExpiringThreshold(shelfLife: number): number {
  if (shelfLife <= EXPIRING_THRESHOLDS.SHORT_SHELF_LIFE.maxShelfLife) {
    return EXPIRING_THRESHOLDS.SHORT_SHELF_LIFE.threshold;
  }
  if (shelfLife <= EXPIRING_THRESHOLDS.MEDIUM_SHELF_LIFE.maxShelfLife) {
    return EXPIRING_THRESHOLDS.MEDIUM_SHELF_LIFE.threshold;
  }
  if (shelfLife <= EXPIRING_THRESHOLDS.LONG_SHELF_LIFE.maxShelfLife) {
    return EXPIRING_THRESHOLDS.LONG_SHELF_LIFE.threshold;
  }
  return EXPIRING_THRESHOLDS.VERY_LONG_SHELF_LIFE.threshold;
}

/**
 * 获取周转健康状态
 */
export function getTurnoverHealthStatus(
  turnoverDays: number
): 'excellent' | 'good' | 'attention' | 'warning' {
  if (turnoverDays <= TURNOVER_EXCELLENT_DAYS) return 'excellent';
  if (turnoverDays <= TURNOVER_GOOD_DAYS) return 'good';
  if (turnoverDays <= TURNOVER_ATTENTION_DAYS) return 'attention';
  return 'warning';
}

/**
 * 获取临期预警级别
 */
export function getExpiringWarningLevel(
  expiringRate: number
): 'normal' | 'attention' | 'warning' | 'serious' {
  if (expiringRate > EXPIRING_RATE_SERIOUS) return 'serious';
  if (expiringRate > EXPIRING_RATE_WARNING) return 'warning';
  if (expiringRate > EXPIRING_RATE_ATTENTION) return 'attention';
  return 'normal';
}

// ==================== OA节点时限配置 ====================

/** 首次催办延迟（分钟，相对 deadline_at） @usedBy oa-timeout.service.ts */
export const OA_TIMEOUT_FIRST_REMINDER_DELAY_MINUTES = 0;

/** 催办间隔（分钟） @usedBy oa-timeout.service.ts */
export const OA_TIMEOUT_REMINDER_INTERVAL_MINUTES = 480;

/** 最大催办次数 @usedBy oa-timeout.service.ts */
export const OA_TIMEOUT_MAX_REMINDER_COUNT = 10;

/** 催办N次后抄送上级 @usedBy oa-timeout.service.ts */
export const OA_TIMEOUT_CC_SUPERVISOR_THRESHOLD = 2;

/** 催办批量处理数量 @usedBy oa-timeout.service.ts */
export const OA_TIMEOUT_REMINDER_BATCH_SIZE = 50;

/** 催办批量处理间隔（毫秒） @usedBy oa-timeout.service.ts */
export const OA_TIMEOUT_REMINDER_BATCH_INTERVAL_MS = 2000;

// ==================== 应收看板超时预警 ====================

/** 催收节点即将超时阈值（小时） @usedBy ar-dashboard.service.ts */
export const AR_TIMEOUT_WARNING_HOURS = 24;
