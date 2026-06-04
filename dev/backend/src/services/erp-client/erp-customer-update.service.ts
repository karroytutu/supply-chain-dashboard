/**
 * ERP 客户档案泛化更新服务
 * 支持更新任意客户字段（名称、联系人、等级、渠道、片区、状态、门头照等）
 * @module services/erp-client/erp-customer-update.service
 */

import { erpPost } from './erp-client';
import { getErpCustomerProfile } from './erp-customer.service';
import { cache } from '../../utils/cache';
import { CACHE_KEY } from '../../utils/cache-keys';

// =====================================================
// 类型定义
// =====================================================

/** 客户档案可更新字段 */
export interface CustomerFieldUpdates {
  name?: string;
  contactName?: string;
  contactTel?: string;
  state?: number;
  consumerManagerName?: string;
  consumerManagerId?: number;
  /** 服务员工 ID */
  serviceStaffId?: number;
  /** 服务员工名称 */
  serviceStaffName?: string;
  gradeId?: string | number;
  gradeName?: string;
  groupId?: string | number;
  groupName?: string;
  areaId?: string | number;
  areaName?: string;
  /** 门头照 imgId（Profile API 中 picture 字段存储 imgId 字符串） */
  picture?: string;
}

// =====================================================
// 更新方法
// =====================================================

/**
 * 泛化更新 ERP 客户档案
 * 获取最新 profile → 合并变更字段 → POST update-consumer
 *
 * **TOCTOU 限制说明**：
 * get-profile 与 post-update 之间存在时间窗口，如果同一客户在此期间被其他操作
 * （如并发 OA 审批回调、ERP batch-edit）修改，可能导致部分字段被过期快照覆盖。
 * 当前 OA 审批场景为低频串行执行，风险较低，可接受。
 * 如果 ERP update-consumer API 未来支持 PATCH（部分字段更新），
 * 应改为仅发送变更字段而非完整 profile，彻底消除竞态风险。
 *
 * @param customerId ERP 客户 ID
 * @param updates 需要更新的字段（仅覆盖非 undefined 字段）
 */
export async function erpUpdateCustomerFields(
  customerId: number,
  updates: CustomerFieldUpdates
): Promise<void> {
  // 获取客户完整资料（最新快照）
  const customer = await getErpCustomerProfile(customerId);

  // 合并更新字段到 profile（仅覆盖非 undefined 字段）
  const updateKeys = Object.keys(updates) as Array<keyof CustomerFieldUpdates>;
  for (const key of updateKeys) {
    const value = updates[key];
    if (value !== undefined) {
      (customer as Record<string, unknown>)[key] = value;
    }
  }

  await erpPost('/web/consumer/update-consumer', customer, {
    pathPrefix: '/saas/pro/',
    businessType: 'customer_modify_profile',
  });

  // 写入后失效客户资料 + 搜索缓存，确保后续读取最新数据
  cache.invalidate(CACHE_KEY.ERP_CUSTOMER_PROFILE_PREFIX);
  cache.invalidate(CACHE_KEY.ERP_CUSTOMER_SEARCH_PREFIX);
}
