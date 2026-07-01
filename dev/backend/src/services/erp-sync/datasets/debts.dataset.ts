/**
 * 客户欠款数据集配置
 * Type A (snapshot): 每 2 分钟全量 UPSERT
 * @module services/erp-sync/datasets/debts
 */

import { fetchDebtsFromErpApi } from '../../erp-client/erp-debt.service';
import type { ERPDebtRecord } from '../../erp-debt/erp-debt.types';
import type { SyncSourceConfig } from '../sync-types';

export const debtsConfig: SyncSourceConfig = {
  id: 'debts',
  name: '客户欠款',
  type: 'snapshot',
  fetchAll: async () => fetchDebtsFromErpApi(),
  transform: (api: unknown) => {
    const r = api as ERPDebtRecord;
    return {
      bill_id: r.billId,
      biz_str: r.bizStr ?? null,
      biz_order_str: r.bizOrderStr,
      consumer_name: r.consumerName,
      consumer_code: null, // ERP欠款API不直接返回consumerCode，需从客户档案补充
      trader_id: null,
      settler_id: null,
      settler_name: null,
      manager_users: r.managerUsers,
      total_amount: r.totalAmount,
      left_amount: r.leftAmount,
      settle_method: r.settleMethod,
      consumer_expire_day: r.consumerExpireDay,
      bill_type: null,
      bill_type_name: r.billTypeName,
      work_time: r.workTime,
      hoard_tag: r.hoardTag ?? null,
      collect_state: null,
      settlement_state: null,
      write_off_amount: r.writeOffAmount,
      pre_pay_amount: null,
      dept_name: null,
      salesman_name: null,
      bill_note: r.billNote ?? null,
      is_hoard: null,
      uuid: null,
    };
  },
  targetTable: 'erp_debts',
  primaryKey: ['bill_id'],
  intervalMs: 120000,
  pageSize: 2000,
  enableFallback: true,
  postProcessors: [
    { type: 'changelog', targetTable: 'erp_debt_changes' },
    { type: 'daily-summary', targetTable: 'erp_debt_daily_summary', groupBy: ['consumer_name'] },
  ],
};
