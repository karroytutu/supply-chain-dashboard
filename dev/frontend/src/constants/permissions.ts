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
  },

  // 战略商品模块
  STRATEGIC: {
    READ: 'strategic:read',
    WRITE: 'strategic:write',
    CONFIRM: {
      PROCUREMENT: 'strategic:confirm:procurement',
      MARKETING: 'strategic:confirm:marketing',
    },
  },

  // 财务模块 - 应收账款
  FINANCE: {
    AR: {
      READ: 'finance:ar:read',
      WRITE: 'finance:ar:write',
      MANAGE: 'finance:ar:manage',
      COLLECT: 'finance:ar:collect',
      REVIEW: 'finance:ar:review',
      PENALTY: 'finance:ar:penalty',
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

  // 退货规则模块
  GOODS_RULES: {
    READ: 'goods-rules:read',
    WRITE: 'goods-rules:write',
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
  CASHIER: 'cashier',
  MARKETING_SUPERVISOR: 'marketing_supervisor',
} as const;

/**
 * 权限类型定义
 */
export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS] |
  typeof PERMISSIONS.SYSTEM[keyof typeof PERMISSIONS.SYSTEM][keyof typeof PERMISSIONS.SYSTEM.USER] |
  typeof PERMISSIONS.STRATEGIC[keyof typeof PERMISSIONS.STRATEGIC] |
  typeof PERMISSIONS.STRATEGIC.CONFIRM[keyof typeof PERMISSIONS.STRATEGIC.CONFIRM] |
  typeof PERMISSIONS.FINANCE.AR[keyof typeof PERMISSIONS.FINANCE.AR] |
  typeof PERMISSIONS.PROCUREMENT[keyof typeof PERMISSIONS.PROCUREMENT] |
  typeof PERMISSIONS.PROCUREMENT.RETURN[keyof typeof PERMISSIONS.PROCUREMENT.RETURN] |
  typeof PERMISSIONS.GOODS_RULES[keyof typeof PERMISSIONS.GOODS_RULES];

/**
 * 角色类型定义
 */
export type RoleCode = typeof ROLES[keyof typeof ROLES];

export default PERMISSIONS;
