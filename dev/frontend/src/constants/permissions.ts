/**
 * 权限编码常量定义
 * 三段式命名：{模块}:{资源}:{操作}
 * 使用方式：import { PERMISSIONS } from '@/constants/permissions';
 */
export const PERMISSIONS = {
  // 系统管理模块
  SYSTEM: {
    USER: {
      READ: 'system:user:read',
      WRITE: 'system:user:write',
      DELETE: 'system:user:delete',
    },
    ROLE: {
      READ: 'system:role:read',
      WRITE: 'system:role:write',
      DELETE: 'system:role:delete',
    },
    PERMISSION: {
      READ: 'system:permission:read',
      WRITE: 'system:permission:write',
    },
  },

  // 财务模块
  FINANCE: {
    AR: {
      READ: 'finance:ar:read',
      WRITE: 'finance:ar:write',
      COLLECT: 'finance:ar:collect',
      PENALTY: 'finance:ar:penalty',
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

  // 战略商品模块
  STRATEGIC: {
    READ: 'strategic:read',
    WRITE: 'strategic:write',
    CONFIRM: {
      PROCUREMENT: 'strategic:confirm:procurement',
      MARKETING: 'strategic:confirm:marketing',
    },
  },
} as const;

// 权限类型定义
export type PermissionCode = typeof PERMISSIONS;
export type SystemPermission = typeof PERMISSIONS.SYSTEM;
export type FinancePermission = typeof PERMISSIONS.FINANCE;
export type StrategicPermission = typeof PERMISSIONS.STRATEGIC;
