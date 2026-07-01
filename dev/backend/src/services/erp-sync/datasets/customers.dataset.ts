/**
 * 客户档案数据集配置
 * Type A (snapshot): 每 2 分钟全量 UPSERT
 * @module services/erp-sync/datasets/customers
 */

import { searchErpCustomers } from '../../erp-client/erp-customer.service';
import type { SyncSourceConfig } from '../sync-types';

export const customersConfig: SyncSourceConfig = {
  id: 'customers',
  name: '客户档案',
  type: 'snapshot',
  fetchAll: async () => searchErpCustomers(),
  transform: (api: unknown) => {
    const r = api as Record<string, unknown>;
    return {
      id: r.id,
      name: r.name ?? null,
      short_name: r.shortName ?? null,
      consumer_code: r.consumerCode ?? null,
      contact_name: r.contactName ?? null,
      contact_tel: r.contactTel ?? null,
      state: r.state ?? null,
      doc_state: r.docState ?? null,
      area_id: r.areaId ?? null,
      area_name: r.areaName ?? null,
      group_id: r.groupId ?? null,
      group_name: r.groupName ?? null,
      consumer_manager_id: r.consumerManagerId ?? null,
      consumer_manager_name: r.consumerManagerName ?? null,
      settle_consumer_id: r.settleConsumerId ?? null,
      settle_consumer_name: r.settleConsumerName ?? null,
      max_debt_days: r.maxDebtDays ?? null,
      max_debt_order_num: r.maxDebtOrderNum ?? null,
      max_debt_amount: r.maxDebtAmount ?? null,
      settle_method: r.settleMethod ?? null,
      debt_amount: r.debtAmount ?? 0,
      address: r.address ?? null,
      province: r.province ?? null,
      city: r.city ?? null,
      district: r.district ?? null,
      grade_id: r.gradeId ?? null,
      grade_name: r.gradeName ?? null,
      cooperation_type_name: r.cooperationTypeName ?? null,
      scan_full_pay: r.scanFullPay ?? null,
      auto_write_off: r.autoWriteOff ?? 0,
      picture: r.picture ?? null,
      attached_pic_urls: r.attachedPicUrls ? JSON.stringify(r.attachedPicUrls) : null,
    };
  },
  targetTable: 'erp_customers',
  primaryKey: ['id'],
  intervalMs: 120000,
  pageSize: 2000,
  enableFallback: true,
};
