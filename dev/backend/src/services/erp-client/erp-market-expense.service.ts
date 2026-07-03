/**
 * ERP 市场费用服务
 * 兑付协议创建/查询/终止 + 客户费用单创建/查询
 * @module services/erp-client/erp-market-expense.service
 */

import { erpPost, erpGet } from './erp-client';
import { getErpDefaults } from './erp-config';
import { createLogger } from '../../utils/logger';
import { beijingDate, beijingDateTime } from '../../utils/beijingTime';
import { BAD_DEBT_SUBJECT_ID, BAD_DEBT_SUBJECT_NAME } from '../../utils/constants';

const log = createLogger('MarketExpense');

// =====================================================
// 类型定义
// =====================================================

/** 创建兑付协议请求参数 */
export interface CreateChargeContractParams {
  type: 'CHARGE_CONTRACT_CASH' | 'CHARGE_CONTRACT_GOODS';
  chargeType: number;
  chargeTypeName: string;
  chargeBrandId: number | string | null;
  name: string;
  consumerId: number;
  consumerName: string;
  details: CashContractDetail[] | GoodsContractDetail[];
  workDate: string;
  note?: string;
  saleNote?: string;
}

interface CashContractDetail {
  amount: string;
}

interface GoodsContractDetail {
  amount: string;
  fulfillPrice: string;
  goodsId: number;
  goodsPrice: string;
  goodsQuantity: string;
  goodsUnitTag: string;
}

/** 创建兑付协议响应 */
export interface CreateChargeContractResult {
  contractStr: string;
  state: string;
}

/** 创建客户费用单请求参数 */
export interface CreateCustomerExpenditureParams {
  traderId: number;
  traderName: string;
  totalAmount: number;
  subjectId: number;
  subjectName: string;
  contractStr: string;
  contractId: number;
  contractDetailId: number;
  note?: string;
  brandId?: number | null;
}

/** 创建客户费用单响应 */
export interface CreateCustomerExpenditureResult {
  id: number;
  billStr: string;
  state: string;
}

/** 兑付协议列表记录 */
export interface ChargeContractRecord {
  billStr: string;
  billId: number;
  name: string;
  consumerId: number;
  consumerName: string;
  chargeType: number;
  chargeTypeName: string;
  type: string;
  totalAmount: string;
  state: string;
  fulfillResult: string;
  goodsQuantityStr?: string;
}

/** 客户费用单列表记录 */
export interface ExpenditureBillRecord {
  id: number;
  billStr: string;
  totalAmount: string;
  state: string;
  traderName?: string;
  salesmanName?: string;
}

// =====================================================
// 创建兑付协议
// =====================================================

/**
 * 创建兑付协议（现金或商品）
 * POST /saas/pro/bill/contract/cost/approve
 */
export async function createChargeContract(
  params: CreateChargeContractParams
): Promise<CreateChargeContractResult> {
  const { cid, uid, defaultSalesmanId, defaultDeptId } = getErpDefaults();

  const body = {
    type: params.type,
    details: params.details,
    cashType: 'MANUAL_PAY_AFTER',
    isBaseUnit: false,
    chargeBrandId: params.chargeBrandId != null ? String(params.chargeBrandId) : null,
    chargeType: params.chargeType,
    chargeTypeName: params.chargeTypeName,
    name: params.name,
    consumerId: params.consumerId,
    consumerName: params.consumerName,
    settleConsumerId: params.consumerId,       // 恒等于 consumerId
    settleConsumerName: params.consumerName,
    salesmanId: defaultSalesmanId,
    salesmanName: '鑫链云（AI员工）',
    deptId: defaultDeptId,
    deptName: '贵州鑫众合商贸有限公司',
    workDate: params.workDate || beijingDate(),
    note: params.note || '',
    saleNote: params.saleNote || '',
    activeStartDate: '',
    activeEndDate: '',
    imageIdList: [],
    contractTagInfo: null,
    billStr: null,
    cid,
    uid,
  };

  log.info(`创建兑付协议: type=${params.type}, consumer=${params.consumerName}, chargeType=${params.chargeType}`);

  const response = (await erpPost(
    '/bill/contract/cost/approve',
    body,
    { pathPrefix: '/saas/pro/', businessType: 'create_charge_contract' }
  )) as any;

  // 响应结构: { code: 0, data: { code: 0, data: "DFXYxxx", state: "APPROVED" } }
  const inner = response?.data;
  if (!inner || inner.code !== 0) {
    throw new Error(`创建兑付协议失败: ${inner?.message || JSON.stringify(response)}`);
  }

  return {
    contractStr: inner.data,
    state: inner.state,
  };
}

// =====================================================
// 兑付生成客户费用单（仅现金场景）
// =====================================================

/**
 * 兑付生成客户费用单
 * POST /saas/pro/expenditure-bill/save-approve-trade-expenditure
 */
export async function createCustomerExpenditure(
  params: CreateCustomerExpenditureParams
): Promise<CreateCustomerExpenditureResult> {
  const { cid, uid, defaultSalesmanId, defaultDeptId } = getErpDefaults();
  const now = beijingDateTime();

  const body = {
    traderId: params.traderId,
    settlerId: params.traderId,               // 恒等于 traderId
    traderType: 'STORE',
    traderName: params.traderName,
    settlerName: params.traderName,
    totalAmount: params.totalAmount,
    salesmanId: defaultSalesmanId,
    salesmanName: '鑫链云（AI员工）',
    deptId: defaultDeptId,
    deptName: '贵州鑫众合商贸有限公司',
    workTime: now,
    operatorName: '鑫链云（AI员工）',
    operateTime: now,
    state: 'NORMAL',
    note: params.note || '',
    fromFollowRebate: false,
    brandId: params.brandId ? String(params.brandId) : '',  // 顶层 brandId，与供应商费用单一致
    details: [{
      subjectId: params.subjectId,
      subjectName: params.subjectName,
      note: params.note || '',
      paymentAmount: params.totalAmount,
      contractStr: params.contractStr,
      contractId: params.contractId,
      contractDetailId: params.contractDetailId,
      contractName: params.contractStr,
      haveFulfill: true,
      brandId: params.brandId || 0,
    }],
    imgIds: [],
    cid,
    uid,
  };

  log.info(`兑付生成费用单: trader=${params.traderName}, amount=${params.totalAmount}, contract=${params.contractStr}`);

  const response = (await erpPost(
    '/expenditure-bill/save-approve-trade-expenditure',
    body,
    { pathPrefix: '/saas/pro/', businessType: 'create_customer_expenditure' }
  )) as any;

  const data = response?.data;
  if (!data) {
    throw new Error(`兑付生成费用单失败: ${JSON.stringify(response)}`);
  }

  return {
    id: data.id,
    billStr: data.billStr,
    state: data.state || 'APPROVED',
  };
}

// =====================================================
// 坏账处理：创建客户费用单（无兑付协议）
// =====================================================

/** 创建坏账费用单请求参数 */
export interface CreateBadDebtExpenditureParams {
  traderId: number;
  traderName: string;
  totalAmount: number;
  note?: string;
}

/**
 * 创建坏账费用单（无兑付协议）
 * POST /saas/pro/expenditure-bill/save-approve-trade-expenditure
 *
 * 与 createCustomerExpenditure 的差异：
 * - haveFulfill: false（无兑付协议）
 * - contractStr/contractId/contractDetailId 均为 null
 * - subjectId 固定为 339（坏账费用）
 *
 * @usedBy bad-debt-callback.ts
 */
export async function createBadDebtExpenditure(
  params: CreateBadDebtExpenditureParams,
  idemKey?: string
): Promise<CreateCustomerExpenditureResult> {
  const { cid, uid, defaultSalesmanId, defaultDeptId } = getErpDefaults();
  const now = beijingDateTime();

  const body = {
    operatorId: defaultSalesmanId,
    traderId: params.traderId,
    settlerId: params.traderId,
    traderType: 'STORE',
    traderName: params.traderName,
    settlerName: params.traderName,
    totalAmount: params.totalAmount,
    salesmanId: defaultSalesmanId,
    salesmanName: '鑫链云（AI员工）',
    deptId: defaultDeptId,
    deptName: '贵州鑫众合商贸有限公司',
    workTime: now,
    operatorName: '鑫链云（AI员工）',
    operateTime: now,
    state: null,
    note: params.note || '',
    fromFollowRebate: false,
    brandId: '',
    details: [{
      subjectId: BAD_DEBT_SUBJECT_ID,
      subjectName: BAD_DEBT_SUBJECT_NAME,
      note: params.note || '',
      paymentAmount: params.totalAmount,
      contractStr: null,
      contractId: null,
      contractDetailId: null,
      contractName: null,
      haveFulfill: false,
      brandId: 0,
    }],
    imgIds: [],
    cid,
    uid,
  };

  log.info(`坏账创建费用单: trader=${params.traderName}, amount=${params.totalAmount}`);

  const response = (await erpPost(
    '/expenditure-bill/save-approve-trade-expenditure',
    body,
    {
      pathPrefix: '/saas/pro/',
      businessType: 'create_bad_debt_expenditure',
      headers: idemKey ? { idemkey: idemKey } : undefined,
    }
  )) as any;

  const data = response?.data;
  if (!data) {
    throw new Error(`坏账创建费用单失败: ${JSON.stringify(response)}`);
  }

  return {
    id: data.id,
    billStr: data.billStr,
    state: data.state || 'APPROVED',
  };
}

// =====================================================
// 查询兑付协议详情（获取 contractId / contractDetailId）
// =====================================================

/**
 * 查询兑付协议详情
 * GET /saas/pro/bill/contract/cost/detail?billStr=xxx
 */
export async function getChargeContractDetail(billStr: string): Promise<{
  billId: number;
  contractStr: string;
  detailIds: number[];
}> {
  const { cid, uid } = getErpDefaults();

  const response = (await erpGet(
    '/bill/contract/cost/detail',
    { billStr, cid, uid },
    { pathPrefix: '/saas/pro/', businessType: 'get_charge_contract_detail' }
  )) as any;

  const data = response?.data;
  if (!data || !data.billId) {
    throw new Error(`查询兑付协议详情失败: billStr=${billStr}`);
  }

  const detailIds = (data.details || []).map((d: any) => d.detailId).filter(Boolean);

  return {
    billId: data.billId,
    contractStr: data.billStr || billStr,
    detailIds,
  };
}

// =====================================================
// 终止兑付协议
// =====================================================

/**
 * 终止兑付协议
 * POST /saas/pro/bill/contract/cost/terminate
 * 注意：contract-un-approve-bill-no 仅为预检查接口，不会改变协议状态
 * 实际终止需调用 /terminate 端点
 */
export async function terminateChargeContract(billStr: string, reason?: string): Promise<void> {
  const { cid, uid } = getErpDefaults();

  log.info(`终止兑付协议: billStr=${billStr}`);

  await erpPost(
    '/bill/contract/cost/terminate',
    { billStr, reason: reason || '系统自动终止', cid, uid },
    { pathPrefix: '/saas/pro/', businessType: 'terminate_charge_contract' }
  );
}
