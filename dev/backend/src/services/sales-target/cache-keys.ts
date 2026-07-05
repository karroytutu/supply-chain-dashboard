/**
 * 目标管理模块 - 缓存键前缀
 * 统一管理所有缓存键前缀，避免各文件重复定义
 */

/** 目标主数据缓存前缀（目标列表、明细） */
export const TARGET_CACHE_PREFIX = 'sales:target';

/** ERP 相关缓存前缀（概览、客户、商品、营销师） */
export const ERP_CACHE_PREFIX = 'sales:target:erp';
