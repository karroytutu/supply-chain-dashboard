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
    EXPORT: {
      WRITE: 'dashboard:export:write',
    },
  },

  // 系统管理模块
  SYSTEM: {
    // 用户管理
    USER: {
      READ: 'system:user:read',
      WRITE: 'system:user:write',
      DELETE: 'system:user:delete',
    },
    // 角色管理
    ROLE: {
      READ: 'system:role:read',
      WRITE: 'system:role:write',
      DELETE: 'system:role:delete',
    },
    // 权限管理
    PERMISSION: {
      READ: 'system:permission:read',
      WRITE: 'system:permission:write',
      DELETE: 'system:permission:delete',
    },
    // 同步管理
    SYNC: {
      READ: 'system:sync:read',
      WRITE: 'system:sync:write',
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
    RETURN: {
      READ: 'return:read',
      WRITE: 'return:write',
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
      READ: 'finance:ar:read',
      WRITE: 'finance:ar:write',
      PENALTY: 'finance:ar:penalty',
      // 催收操作（兼容旧引用）
      COLLECTION_READ: 'finance:ar:read',
      COLLECTION_WRITE: 'finance:ar:write',
      COLLECTION_VERIFY: 'finance:ar:write',
      COLLECTION_ESCALATE: 'finance:ar:write',
    },
  },

  // 应收账款模块（已迁移至 FINANCE.AR，保留兼容）
  AR: {
    // 催收管理
    COLLECTION: {
      READ: 'finance:ar:read',
      WRITE: 'finance:ar:write',
      VERIFY: 'finance:ar:write',
      ESCALATE: 'finance:ar:write',
    },
  },

  // OA审批模块
  OA: {
    APPROVAL: {
      READ: 'oa:approval:read',
      WRITE: 'oa:approval:write',
    },
    DATA: {
      READ: 'oa:data:read',
      EXPORT: 'oa:data:export',
    },
  },

  // 固定资产管理模块
  ASSET: {
    READ: 'asset:read',
    WRITE: 'asset:write',
    DATA_INPUT: 'asset:data_input',
    PURCHASE: {
      WRITE: 'asset:purchase:write',
    },
    TRANSFER: {
      WRITE: 'asset:transfer:write',
    },
    MAINTENANCE: {
      WRITE: 'asset:maintenance:write',
    },
    DISPOSAL: {
      WRITE: 'asset:disposal:write',
    },
  },
} as const;

/**
 * 角色编码常量
 */
export const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  OPERATOR: 'operator',
  VIEWER: 'viewer',
  PROCUREMENT_MANAGER: 'procurement_manager',
  WAREHOUSE_MANAGER: 'warehouse_manager',
  FINANCE_STAFF: 'finance_staff',
  CURRENT_ACCOUNTANT: 'current_accountant',
  CASHIER: 'cashier',
  MARKETING_MANAGER: 'marketing_manager',
  MARKETER: 'marketer',
  ADMIN_STAFF: 'admin_staff',
  OPERATIONS_MANAGER: 'operations_manager',
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
