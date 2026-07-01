/**
 * 权限编码常量
 * 集中管理所有权限编码，避免拼写错误，便于维护和重构
 *
 * 命名规范：{模块}:{资源}:{操作}
 * - 模块：dashboard, system, strategic, finance, procurement 等
 * - 资源：user, role, permission, product, order 等
 * - 操作：read (查看), write (编辑), delete (删除), confirm (确认) 等
 */

export const PERMISSIONS = {
  // 仪表盘模块
  DASHBOARD: {
    VIEW: {
      READ: 'dashboard:view:read',
    },
  },

  // 系统管理模块
  SYSTEM: {
    // 用户管理
    USER: {
      READ: 'system:user:read',
      WRITE: 'system:user:write',
      SWITCH: 'system:user:switch',
    },
    // 角色管理
    ROLE: {
      READ: 'system:role:read',
      WRITE: 'system:role:write',
    },
    // 权限管理
    PERMISSION: {
      READ: 'system:permission:read',
      WRITE: 'system:permission:write',
    },
    // 同步管理
    SYNC: {
      READ: 'system:sync:read',
      WRITE: 'system:sync:write',
    },
    // Token 管理
    TOKEN: {
      READ: 'system:token:read',
      WRITE: 'system:token:write',
    },
    // ERP 数据同步管理
    ERP_SYNC: {
      READ: 'system:erp-sync:read',
      WRITE: 'system:erp-sync:write',
    },
    // 组织架构
    ORG: {
      READ: 'system:org:read',
    },
  },

  // 战略商品模块
  STRATEGIC: {
    READ: 'strategic:read',
    WRITE: 'strategic:write',
    EXPORT: 'strategic:export',
    CONFIRM: {
      PROCUREMENT: 'strategic:confirm:procurement',
      MARKETING: 'strategic:confirm:marketing',
    },
  },

  // 采购模块
  PROCUREMENT: {
    ARCHIVE: {
      READ: 'procurement:archive:read',
    },
  },

  // 退货管理模块
  RETURN: {
    READ: 'return:read',
    WRITE: 'return:write',
    PENALTY: {
      READ: 'return:penalty:read',
      WRITE: 'return:penalty:write',
    },
  },

  // 退货规则模块
  GOODS_RULES: {
    READ: 'goods-rules:read',
    WRITE: 'goods-rules:write',
  },

  // 财务模块（应收账款与催收）
  FINANCE: {
    AR: {
      READ: 'ar:collection:read',
    },
    AR_PENALTY: {
      READ: 'finance:ar:penalty:read',
      WRITE: 'finance:ar:penalty:write',
    },
    CREDIT: {
      READ: 'finance:credit:read',
      WRITE: 'finance:credit:write',
    },
  },

  // 销售分析模块
  SALES: {
    ANALYSIS: {
      READ: 'sales:analysis:read',
    },
    TARGET: {
      READ: 'sales:target:read',
      WRITE: 'sales:target:write',
    },
  },

  // 统一考核模块
  ASSESSMENT: {
    READ: 'assessment:read',
    WRITE: 'assessment:write',
  },

  // OA系统模块
  OA: {
    READ: 'oa:read',
    FORM_MANAGE: 'oa:form:manage',
    WORKFLOW: {
      HANDOVER: 'oa:workflow:handover',
    },
  },
} as const;

/**
 * 角色编码常量（与后端 ROLE_CODES 保持一致）
 */
export const ROLES = {
  // 管理层
  ADMIN: 'admin',
  GENERAL_MANAGER: 'general_manager',
  DEPARTMENT_MANAGER: 'department_manager',
  OPERATIONS_MANAGER: 'operations_manager',
  // 财务
  CURRENT_ACCOUNTANT: 'current_accountant',
  CASHIER: 'cashier',
  // 营销
  MARKETING_MANAGER: 'marketing_manager',
  MARKETER: 'marketer',
  // 供应链
  PROCUREMENT_MANAGER: 'procurement_manager',
  WAREHOUSE_MANAGER: 'warehouse_manager',
  WAREHOUSE_OPERATOR: 'warehouse_operator',
  // 行政
  ADMIN_STAFF: 'admin_staff',
} as const;

/**
 * 权限类型定义 - 递归提取所有权限字符串值
 */
type DeepValue<T> = T extends string ? T : T extends object ? DeepValue<T[keyof T]> : never;
export type PermissionCode = DeepValue<typeof PERMISSIONS>;

/**
 * 角色类型定义
 */
export type RoleCode = typeof ROLES[keyof typeof ROLES];

export default PERMISSIONS;
