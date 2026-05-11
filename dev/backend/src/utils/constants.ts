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

// ==================== 预警级别阈值 ====================

/** 临期率 - 严重预警阈值（%） @usedBy overview.service.ts, frontend/warning.ts */
export const EXPIRING_RATE_SERIOUS = 5;

/** 临期率 - 警告阈值（%） @usedBy overview.service.ts, frontend/warning.ts */
export const EXPIRING_RATE_WARNING = 3;

/** 临期率 - 关注阈值（%） @usedBy overview.service.ts, frontend/warning.ts */
export const EXPIRING_RATE_ATTENTION = 1;

// ==================== 角色编码 ====================

/** 管理角色编码（用于权限判断和角色映射）
 * @usedBy ar-collection-query.controller.ts, ar-collection.mutation.ts
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

/** 催收延期最大天数 @usedBy ar-collection.mutation.ts (校验延期天数) */
export const AR_EXTENSION_MAX_DAYS = 30;

/** 催收默认到期天数 @usedBy ar-warning.query.ts, ar-collection-task-generator.ts, ar-warning.task.ts */
export const AR_DEFAULT_EXPIRE_DAYS = 7;

/** 结算方式-消费者到期标识 @usedBy ar-warning.query.ts, ar-collection-task-generator.ts, ar-warning.task.ts */
export const AR_SETTLE_METHOD_CONSUMER_EXPIRE = 2;

/** 催收考核起效日期 @usedBy ar-assessment-calculate.ts (判断考核是否生效) */
export const AR_ASSESSMENT_EFFECTIVE_DATE = '2026-04-23';

/** 催收压单标记-正常 @usedBy ar-debt-enrichment.service.ts */
export const AR_HOARD_TAG_NORMAL = 'NORMAL';

/** 催收压单标记-压单 @usedBy ar-debt-enrichment.service.ts */
export const AR_HOARD_TAG_HOARD = 'HOARD';

/** 催收明细压单排除状态 @usedBy ar-hoard-reconcile.ts (标记压单排除明细) */
export const AR_DETAIL_STATUS_HOARD_EXCLUDED = 'hoard_excluded';

/** 升级处理角色映射: 升级层级 → 处理角色编码
 * @usedBy ar-collection.mutation.ts (升级时确定目标角色)
 * @usedBy ar-collection.mutation.ts (退回时确定恢复角色)
 */
export const AR_ESCALATION_HANDLER_ROLES: Record<number, string> = {
  1: ROLE_CODES.MARKETING_MANAGER,
  2: ROLE_CODES.CURRENT_ACCOUNTANT,
};

/** 退回目标角色映射: 当前升级层级 → 退回后处理角色编码
 * @usedBy ar-collection.mutation.ts (退回时确定恢复角色)
 */
export const AR_ROLLBACK_HANDLER_ROLES: Record<number, string> = {
  2: ROLE_CODES.MARKETING_MANAGER,   // L2→L1: 财务退回给营销经理
  1: ROLE_CODES.MARKETER,            // L1→L0: 营销经理退回给营销师
};

// ==================== 退货考核阈值 ====================

/** 退货时保质期不足阈值（天） @usedBy return-penalty-calculate.ts (判断退货考核规则) */
export const RETURN_EXPIRE_INSUFFICIENT_DAYS = 15;

// ==================== 缓存时间配置 ====================

/** 战略商品缓存过期时间 @usedBy warning-cache.ts (战略商品ID缓存) */
export const CACHE_TTL_STRATEGIC_PRODUCT = 5 * 60 * 1000;

/** 权限缓存过期时间 @usedBy permission-cache.service.ts (权限缓存) */
export const CACHE_TTL_PERMISSION = 30 * 1000;

// ==================== 客户授信审批阈值 ====================

/**
 * OA审批 auto 节点卡住判定阈值（毫秒）
 * 超过此时间的 processing 状态视为卡住，由定时任务或启动恢复处理
 * @usedBy erp-meta-utils.ts (卡住任务恢复)
 */
export const OA_AUTO_NODE_STUCK_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * OA审批 auto 节点前端轮询间隔（毫秒）
 * @usedBy useAutoNodePolling.ts (轮询间隔)
 */
export const OA_AUTO_NODE_POLL_INTERVAL_MS = 2000;

/** 客户授信-账期/滚单需往来会计审批的最大欠款天数
 * @usedBy customer-credit-callback.ts (CREDIT_APPROVAL_TIERS 配置)
 */
export const CREDIT_OVERDUE_ACCOUNTANT_DAYS = 30;

/** 客户授信-账期/滚单需总经理审批的最大欠款天数
 * @usedBy customer-credit-callback.ts (CREDIT_APPROVAL_TIERS 配置)
 */
export const CREDIT_OVERDUE_GM_DAYS = 60;

/** 客户授信-压单需往来会计审批的金额阈值
 * @usedBy customer-credit-callback.ts (CREDIT_APPROVAL_TIERS 配置)
 */
export const CREDIT_HOLD_AMOUNT_ACCOUNTANT = 500;

/** 客户授信-压单需总经理审批的金额阈值
 * @usedBy customer-credit-callback.ts (CREDIT_APPROVAL_TIERS 配置)
 */
export const CREDIT_HOLD_AMOUNT_GM = 1000;

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

// ==================== OA审批钉钉通知配置 ====================

/** OA审批操作Token过期时间（分钟） @usedBy oa-action-token.ts (Token过期时间) */
export const OA_ACTION_TOKEN_EXPIRY_MINUTES = 30;

/** OA审批通知中表单摘要最大字段数 @usedBy oa-approval-dingtalk.ts (表单摘要提取) */
export const OA_NOTIFICATION_FORM_SUMMARY_MAX_FIELDS = 5;

/** OA审批钉钉通知状态栏映射 @usedBy oa-approval-notify.ts (状态栏更新) */
export const OA_DINGTALK_STATUS = {
  PENDING:    { value: '待审批', bg: '#FA8C16' },
  PROCESSING: { value: '处理中', bg: '#1890FF' },
  APPROVED:   { value: '已通过', bg: '#52C41A' },
  REJECTED:   { value: '已拒绝', bg: '#F5222D' },
  WITHDRAWN:  { value: '已撤回', bg: '#999999' },
  CC:         { value: '抄送',   bg: '#1890FF' },
} as const;

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
export function getTurnoverHealthStatus(turnoverDays: number): 'excellent' | 'good' | 'attention' | 'warning' {
  if (turnoverDays <= TURNOVER_EXCELLENT_DAYS) return 'excellent';
  if (turnoverDays <= TURNOVER_GOOD_DAYS) return 'good';
  if (turnoverDays <= TURNOVER_ATTENTION_DAYS) return 'attention';
  return 'warning';
}

/**
 * 获取临期预警级别
 */
export function getExpiringWarningLevel(expiringRate: number): 'normal' | 'attention' | 'warning' | 'serious' {
  if (expiringRate > EXPIRING_RATE_SERIOUS) return 'serious';
  if (expiringRate > EXPIRING_RATE_WARNING) return 'warning';
  if (expiringRate > EXPIRING_RATE_ATTENTION) return 'attention';
  return 'normal';
}
