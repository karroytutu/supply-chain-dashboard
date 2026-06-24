/**
 * ERP 供应商费用单 + 费用分摊单服务
 * 封装供应商费用单创建审核和费用分摊单创建审核的 ERP API 调用
 * @module services/erp-client/erp-expense-allocation.service
 */
import { createLogger } from '../../utils/logger';
const log = createLogger('ERP');

import { erpPost } from './erp-client';
import { getErpConfig, getErpDefaults } from './erp-config';
import type { ErpBillResponse } from './erp-client.types';

// =====================================================
// 类型定义
// =====================================================

/** 创建供应商费用单请求（save-approve-trade-expenditure） */
export interface CreateSupplierExpenseBillRequest {
  operatorId?: string;
  operateTime: string;
  traderType: 'SUPPLIER';
  traderId: string | number;
  traderName: string;
  /** 费用总额（支持 number 或 string，服务层确保 string 类型） */
  totalAmount: number | string;
  details: Array<{
    id: number;
    subjectId: number;
    subjectName: string;
    deptId: number;
    deptName: string;
    taxRadio: number;
    taxAmount: string;
    noTaxAmount: string;
    paymentAmount: number;
  }>;
  salesmanId: number;
  deptId: number;
  workTime: string;
  note?: string;
  brandId?: string;
  imgIds?: string[];
}

/** 供应商费用单创建响应 */
export interface SupplierExpenseBillResponse {
  id: number;
  billStr: string;
  [key: string]: unknown;
}

/** 费用分摊单明细项（精简3字段） */
export interface AllocationDetailItem {
  allocationAmount: string;
  bizDetailId: number;
  bizType: 'EXPENDITURE' | 'PURCHASE';
}

/** 创建费用分摊单请求（save-approve，精简版） */
export interface CreateExpenseAllocationRequest {
  allocationType: 'PURCHASE';
  allocationWay: 'ALL';
  workTime: string;
  note?: string;
  totalAmount: number;
  expenditureDetail: AllocationDetailItem[];
  settleDetail: AllocationDetailItem[];
}

/** 费用分摊单创建响应 */
export interface ExpenseAllocationResponse {
  id?: number;
  billStr?: string;
  [key: string]: unknown;
}

// =====================================================
// 幂等键生成
// =====================================================

/**
 * 生成物流费用 ERP 幂等键
 * 确定性：相同操作生成相同键，支持重试幂等
 */
export function buildLogisticsFeeIdemKey(
  type: 'EXPENSE' | 'PAID' | 'ALLOCATION',
  instanceId: number,
  nodeOrder: number
): string {
  return `LOGFEE-${type}-${instanceId}-${nodeOrder}`;
}

// =====================================================
// 供应商费用单
// =====================================================

/**
 * 创建供应商费用单并审核
 * POST /saas/pro/expenditure-bill/save-approve-trade-expenditure
 *
 * 与现金费用单（save-approve-cash-expenditure）的区别：
 * - 多了 traderType、traderId、traderName（关联供应商）
 * - 路径为 trade-expenditure 而非 cash-expenditure
 *
 * 注意：时间戳字段（workTime、operateTime）必须动态生成，禁止硬编码
 */
export async function createSupplierExpenseBill(
  payload: CreateSupplierExpenseBillRequest,
  idemKey: string,
  businessId?: number
): Promise<SupplierExpenseBillResponse> {
  const { cid, uid } = getErpDefaults();
  const config = getErpConfig();

  const requestBody = {
    ...payload,
    totalAmount: String(payload.totalAmount),
    imgIds: payload.imgIds || [],
    cid,
    uid,
  };

  const result = await erpPost<{ data?: SupplierExpenseBillResponse }>(
    config.supplierExpenditureBillPath || '/expenditure-bill/save-approve-trade-expenditure',
    requestBody,
    {
      pathPrefix: '/saas/pro/',
      businessType: 'supplier_expense_bill_create',
      businessId,
      headers: { idemkey: idemKey },
    }
  );

  const billData = result?.data;
  if (!billData?.id) {
    log.warn('供应商费用单创建响应缺少 id:', JSON.stringify(result).slice(0, 200));
  }

  log.info(`供应商费用单创建成功: billStr=${billData?.billStr}, id=${billData?.id}`);
  return billData || { id: 0, billStr: '' };
}

// =====================================================
// 费用分摊单
// =====================================================

/**
 * 创建费用分摊单并审核
 * POST /saas/pro/expenditure-allocation/save-approve
 *
 * 请求体精简：每条 expenditureDetail / settleDetail 只需 3 个字段
 * （allocationAmount、bizDetailId、bizType）
 *
 * 注意：时间戳字段（workTime）必须动态生成，禁止硬编码
 */
export async function createExpenseAllocation(
  payload: CreateExpenseAllocationRequest,
  idemKey: string,
  businessId?: number
): Promise<ExpenseAllocationResponse> {
  const { cid, uid } = getErpDefaults();

  const requestBody = {
    ...payload,
    cid,
    uid,
  };

  const result = await erpPost<{ data?: ExpenseAllocationResponse }>(
    '/expenditure-allocation/save-approve',
    requestBody,
    {
      pathPrefix: '/saas/pro/',
      businessType: 'expense_allocation_create',
      businessId,
      headers: { idemkey: idemKey },
    }
  );

  const data = (result?.data || result || {}) as ExpenseAllocationResponse;
  log.info(`费用分摊单创建成功: id=${data?.id}, billStr=${data?.billStr}`);
  return data;
}

/**
 * 取消费用分摊单（反审核）
 * POST /saas/pro/expenditure-allocation/cancel
 */
export async function cancelExpenseAllocation(billId: number): Promise<void> {
  const { cid, uid } = getErpDefaults();

  await erpPost(
    '/expenditure-allocation/cancel',
    { id: billId, cid, uid },
    { pathPrefix: '/saas/pro/', businessType: 'expense_allocation_cancel' }
  );

  log.info(`费用分摊单取消成功: billId=${billId}`);
}
