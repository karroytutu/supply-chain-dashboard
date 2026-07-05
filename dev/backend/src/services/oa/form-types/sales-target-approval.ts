/**
 * 销售目标审批 - 表单类型定义
 * @module services/oa/form-types/sales-target-approval
 *
 * 审批流程：提交人电子签名 → 总经理审批
 * 入口：仅从目标管理页面发起，OA 发起页不展示
 */

import { createLogger } from '../../../utils/logger';
const log = createLogger('OA:SalesTargetApproval');

import { appQuery } from '../../../db/appPool';
import { FormTypeDefinition, OaInstanceRow } from '../oa.types';
import { OA_ROLE } from '../oa-role-codes';
import {
  getTargetById,
  getTargetItems,
} from '../../sales-target/sales-target.repository';
import { changeTargetStatus } from '../../sales-target/sales-target-mutation.service';

import { getMonthRange, validateTargetForSubmission } from '../../sales-target/sales-target-utils';
import { getMarketerStaffId } from '../../sales-target/sales-target-marketer.service';
import { searchErpCustomers } from '../../erp-client/erp-customer.service';
import { SALES_BUSINESS_ATTR_IDS } from '../../../utils/constants';

/**
 * 计算单个营销师的上月实际销售摘要
 * 复用 getMarketerStaffId 避免重复实现营销师→ERP员工匹配逻辑
 */
async function computeLastMonthSalesSummary(
  marketerUserId: number,
  year: number,
  month: number
): Promise<{ lastMonthAmount: number; lastMonthCustomerCount: number; lastMonthSkuCount: number }> {
  const staffId = await getMarketerStaffId(marketerUserId);
  if (staffId === null) {
    return { lastMonthAmount: 0, lastMonthCustomerCount: 0, lastMonthSkuCount: 0 };
  }

  // 查找该 staffId 管理的客户
  const allCustomers = await searchErpCustomers();
  const managedCustomerIds: number[] = [];
  for (const c of allCustomers) {
    if (c.consumerManagerId === staffId) {
      managedCustomerIds.push(c.id);
    }
  }
  if (managedCustomerIds.length === 0) {
    return { lastMonthAmount: 0, lastMonthCustomerCount: 0, lastMonthSkuCount: 0 };
  }

  // 查询上月销售聚合
  const [lastMonthStart, lastMonthEnd] = getMonthRange(year, month, 1);
  const result = await appQuery(
    `SELECT
       COALESCE(SUM(finance_sales_amount::numeric), 0) AS total_amount,
       COUNT(DISTINCT consumer_id) AS customer_count,
       COUNT(DISTINCT goods_id) AS sku_count
     FROM erp_sales_details
     WHERE settle_time >= $1 AND settle_time < $2
       AND business_attr = ANY($3)
       AND consumer_id = ANY($4)`,
    [lastMonthStart, lastMonthEnd, SALES_BUSINESS_ATTR_IDS, managedCustomerIds]
  );

  const row = result.rows[0];
  return {
    lastMonthAmount: Math.round((parseFloat(row.total_amount) || 0) * 100) / 100,
    lastMonthCustomerCount: parseInt(row.customer_count) || 0,
    lastMonthSkuCount: parseInt(row.sku_count) || 0,
  };
}

/**
 * beforeSubmit：校验目标 + 计算摘要数据（状态更新由控制器在审批提交成功后处理）
 */
async function beforeSubmitSalesTarget(
  formData: Record<string, unknown>,
  userId: number
): Promise<Record<string, unknown>> {
  const targetId = Number(formData._targetId);
  if (!targetId || isNaN(targetId)) {
    throw new Error('缺少目标ID');
  }

  // 1. 校验目标存在且状态合法（defense-in-depth，控制器已做主要校验）
  const target = await getTargetById(targetId);
  if (!target) {
    throw new Error('目标不存在');
  }
  validateTargetForSubmission(target);

  // 2. 计算目标摘要
  const items = await getTargetItems(targetId);
  const consumerIds = new Set<number>();
  const goodsIds = new Set<number>();
  let targetAmount = 0;
  for (const item of items) {
    const amt = Number(item.target_amount) || 0;
    targetAmount += amt;
    if (item.erp_consumer_id) consumerIds.add(item.erp_consumer_id);
    if (item.erp_goods_id) goodsIds.add(item.erp_goods_id);
  }
  targetAmount = Math.round(targetAmount * 100) / 100;

  // 3. 计算上月实际数据
  const lastMonth = await computeLastMonthSalesSummary(target.marketer_id, target.year, target.month);

  // 4. 注意：不在此处更新目标状态
  // beforeSubmit 在 OA 事务之前执行（纯计算/查询），
  // 状态更新（pending + oa_instance_id）由控制器在 submitApproval 成功后处理

  // 5. 返回注入的新字段（不展开原始 formData，submitApproval 会负责合并）
  return {
    _marketerUserId: target.marketer_id,  // 供签名节点解析处理人
    marketerName: target.marketer_name,
    targetMonth: `${target.year}年${target.month}月`,
    targetAmount,
    lastMonthAmount: lastMonth.lastMonthAmount,
    targetCustomerCount: consumerIds.size,
    lastMonthCustomerCount: lastMonth.lastMonthCustomerCount,
    targetSkuCount: goodsIds.size,
    lastMonthSkuCount: lastMonth.lastMonthSkuCount,
  };
}

/**
 * onApproved：审批通过后标记目标为 approved
 * 通过 changeTargetStatus（mutation service）统一处理缓存失效，
 * 并检查乐观锁返回值以确保状态变更成功
 */
async function onApprovedSalesTarget(
  _instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const targetId = Number(formData._targetId);
  if (!targetId) return;

  log.info(`目标审批通过: targetId=${targetId}`);
  const updated = await changeTargetStatus(targetId, 'approved', ['pending']);
  if (!updated) {
    log.error(`目标审批通过回调中状态更新失败（乐观锁冲突）: targetId=${targetId}`);
    // 不抛出异常，避免 OA 事务回滚导致审批结果丢失
    // 状态不一致需运维介入处理
  }
}

/**
 * onRejected：审批驳回后标记目标为 rejected
 */
async function onRejectedSalesTarget(
  _instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const targetId = Number(formData._targetId);
  if (!targetId) return;

  log.info(`目标审批驳回: targetId=${targetId}`);
  const updated = await changeTargetStatus(targetId, 'rejected', ['pending']);
  if (!updated) {
    log.error(`目标审批驳回回调中状态更新失败（乐观锁冲突）: targetId=${targetId}`);
  }
}

/**
 * 销售目标审批表单类型定义
 */
export const salesTargetApprovalFormType: FormTypeDefinition = {
  code: 'sales_target_approval',
  name: '销售目标审批',
  icon: 'AimOutlined',
  category: 'marketing',
  sortOrder: 200,
  description: '营销师月度销售目标的制定与审批',
  version: 1,
  allowedRoles: ['marketing_manager'],
  hideFromInitiate: true,

  formSchema: {
    fields: [
      { key: 'marketerName', label: '营销师', type: 'text', required: true, disabled: true },
      { key: 'targetMonth', label: '目标月份', type: 'text', required: true, disabled: true },
      { key: 'targetAmount', label: '目标总额(元)', type: 'money', required: true, disabled: true },
      { key: 'lastMonthAmount', label: '上月实际销售额', type: 'money', required: false, disabled: true },
      { key: 'targetCustomerCount', label: '目标客户数', type: 'number', required: true, disabled: true },
      { key: 'lastMonthCustomerCount', label: '上月实际客户数', type: 'number', required: false, disabled: true },
      { key: 'targetSkuCount', label: '目标SKU数', type: 'number', required: true, disabled: true },
      { key: 'lastMonthSkuCount', label: '上月实际SKU数', type: 'number', required: false, disabled: true },
      { key: 'submitterSignature', label: '本人签名确认', type: 'signature', required: true },
    ],
  },

  workflowDef: {
    nodes: [
      {
        order: 1,
        name: '本人签名确认',
        type: 'handle',
        handler: { formDataUserIdField: '_marketerUserId' },
      },
      {
        order: 2,
        name: '总经理审批',
        type: 'approval',
        handler: { roleCode: OA_ROLE.GM },
      },
    ],
  },

  beforeSubmit: beforeSubmitSalesTarget,
  onApproved: onApprovedSalesTarget,
  onRejected: onRejectedSalesTarget,

  fieldPermissions: {
    nodes: {
      '0': {
        marketerName: 'readonly',
        targetMonth: 'readonly',
        targetAmount: 'readonly',
        lastMonthAmount: 'readonly',
        targetCustomerCount: 'readonly',
        lastMonthCustomerCount: 'readonly',
        targetSkuCount: 'readonly',
        lastMonthSkuCount: 'readonly',
        submitterSignature: 'hidden',
      },
      '1': {
        marketerName: 'readonly',
        targetMonth: 'readonly',
        targetAmount: 'readonly',
        lastMonthAmount: 'readonly',
        targetCustomerCount: 'readonly',
        lastMonthCustomerCount: 'readonly',
        targetSkuCount: 'readonly',
        lastMonthSkuCount: 'readonly',
        submitterSignature: 'editable',
      },
      '2': {
        marketerName: 'readonly',
        targetMonth: 'readonly',
        targetAmount: 'readonly',
        lastMonthAmount: 'readonly',
        targetCustomerCount: 'readonly',
        lastMonthCustomerCount: 'readonly',
        targetSkuCount: 'readonly',
        lastMonthSkuCount: 'readonly',
        submitterSignature: 'readonly',
      },
    },
  },
};
