/**
 * 市场费用申请 - 表单类型定义
 * @module services/oa/form-types/market-expense
 *
 * 支持现金和商品两种费用类型，审批通过后自动在 ERP 创建兑付协议。
 * 现金场景：创建兑付协议 → 兑付生成客户费用单
 * 商品场景：仅创建兑付协议
 */

import { FormTypeDefinition, FormSchema, CallbackResult, OaInstanceRow } from '../oa.types';
import { OA_ROLE } from '../oa-role-codes';
import { MARKET_EXPENSE_SUBJECTS } from '../../../utils/constants';
import { createLogger } from '../../../utils/logger';
import { appQuery as query } from '../../../db/appPool';
import { beijingDate } from '../../../utils/beijingTime';
import { getErpMeta } from '../../fixed-asset/erp-meta-utils';
import { fetchSalesDetails } from '../../erp-client/erp-sales-detail.service';
import {
  createChargeContract,
  createCustomerExpenditure,
  terminateChargeContract,
  getChargeContractDetail,
} from '../../erp-client/erp-market-expense.service';
import { resolveBrandOriginId } from '../../erp-client/erp-brand.service';
import { cleanupExpenditureBill } from '../../erp-client/erp-cleanup';

const log = createLogger('MarketExpense');

/** 从 currUnitId 推导 ERP goodsUnitTag（B=基本, M=中, P=包装） */
function resolveGoodsUnitTag(line: Record<string, unknown>): string {
  // 优先使用前端显式传入的 _goodsUnitTag
  if (line._goodsUnitTag) return line._goodsUnitTag as string;
  // 兜底：从 currUnitId 推导
  const unitId = (line.currUnitId as string) || '';
  const map: Record<string, string> = { BASE: 'B', MID: 'M', PKG: 'P' };
  return map[unitId] || 'P';
}

// =====================================================
// 商品 modal_select 公共配置（参考 promotion-fullgift-offline）
// =====================================================

const GOODS_SELECT_CONFIG = {
  type: 'modal_select' as const,
  required: true,
  searchApi: 'promotion_goods' as const,
  valueKey: 'goodsId',
  labelKey: 'name',
  nameField: '_goodsName',
  searchPlaceholder: '搜索商品名称/品牌',
  columns: [
    { title: '商品名称', dataIndex: 'name' },
    { title: '品牌', dataIndex: 'brandName' },
    { title: '批发价(基本)', dataIndex: 'baseWholesale', format: 'money' as const, align: 'right' as const },
  ],
  autoFill: {
    currUnitId: 'units.0.id',
    currUnitName: 'units.0.id',
    _costPrice: 'costPrice',
    _goodsUnits: 'units',
    _goodsName: 'name',
    _unitFactor: 'units.0.factor',
    _baseWholesale: 'baseWholesale',
    _midWholesale: 'midWholesale',
    _pkgWholesale: 'pkgWholesale',
  },
};

const UNIT_SELECT = {
  type: 'select' as const,
  required: true,
  optionsFromField: '_goodsUnits' as const,
};

const HIDDEN_TEXT = { type: 'text' as const, required: false, hidden: true };
const HIDDEN_NUMBER = { type: 'number' as const, required: false, hidden: true };

// =====================================================
// formSchema
// =====================================================

const marketExpenseFormSchema: FormSchema = {
  fields: [
    // ─── 基本信息 ───────────────────────────────────
    {
      key: 'customerId',
      label: '客户',
      type: 'select' as const,
      required: true,
      searchApi: 'erp_customers' as const,
      nameField: '_customerName',
      autoFill: { _customerName: 'name' },
    },
    { key: '_customerName', label: '客户名称', ...HIDDEN_TEXT },

    {
      key: 'chargeSubject',
      label: '费用科目',
      type: 'select' as const,
      required: true,
      options: [
        { value: '350', label: '独山陈列费用' },
        { value: '351', label: '独山临期处理费用' },
        { value: '352', label: '独山其他市场费用' },
      ],
    },

    {
      key: 'expenseType',
      label: '费用类型',
      type: 'select' as const,
      required: true,
      options: [
        { value: 'cash', label: '现金' },
        { value: 'goods', label: '商品' },
      ],
    },

    {
      key: 'chargeBrandId',
      label: '费用品牌',
      type: 'select' as const,
      required: false,
      searchApi: 'erp_brands' as const,
      nameField: '_brandName',
      autoFill: { _brandName: 'name' },
    },
    { key: '_brandName', label: '品牌名称', ...HIDDEN_TEXT },

    {
      key: 'periodType',
      label: '费用周期类型',
      type: 'select' as const,
      required: true,
      options: [
        { value: 'monthly', label: '月度费用' },
        { value: 'once', label: '一次性费用' },
      ],
    },

    {
      key: 'belongMonths',
      label: '归属月份',
      type: 'select' as const,
      multiple: true,
      required: true,
      options: generateMonthOptions(),
      visibleWhen: { field: 'periodType', operator: '==' as const, value: 'monthly' },
    },

    {
      key: 'remark',
      label: '备注',
      type: 'textarea' as const,
      required: false,
      maxLength: 500,
      placeholder: '请输入备注（可选）',
    },

    // ─── 现金场景区 ──────────────────────────────────
    {
      key: 'cashAmount',
      label: '费用金额',
      type: 'money' as const,
      required: true,
      upper: true,
      visibleWhen: { field: 'expenseType', operator: '==' as const, value: 'cash' },
    },

    // ─── 商品场景区 ──────────────────────────────────
    {
      key: 'goodsList',
      label: '商品列表',
      type: 'table' as const,
      required: true,
      visibleWhen: { field: 'expenseType', operator: '==' as const, value: 'goods' },
      children: [
        { key: 'goodsId', label: '商品', ...GOODS_SELECT_CONFIG },
        { key: '_goodsName', label: '商品名称', ...HIDDEN_TEXT },
        { key: '_goodsUnits', label: '可用单位', ...HIDDEN_TEXT },
        { key: '_baseWholesale', label: '基本批发价', ...HIDDEN_NUMBER },
        { key: '_midWholesale', label: '中单位批发价', ...HIDDEN_NUMBER },
        { key: '_pkgWholesale', label: '包装批发价', ...HIDDEN_NUMBER },
        { key: 'currUnitId', label: '单位ID', ...HIDDEN_TEXT },
        { key: 'currUnitName', label: '单位', ...UNIT_SELECT },
        { key: '_goodsUnitTag', label: '单位标签', ...HIDDEN_TEXT },
        { key: '_costPrice', label: '成本价', type: 'number' as const, required: false, hidden: true },
        { key: '_unitFactor', label: '单位换算系数', type: 'number' as const, required: false, hidden: true, defaultValue: 1 },
        {
          key: 'quantity', label: '费用数量', type: 'number' as const,
          required: true, min: 1,
        },
        {
          key: 'wholesalePrice', label: '商品单价(批发价)', type: 'money' as const,
          required: false, disabled: true,
        },
        {
          key: 'amount', label: '商品金额', type: 'formula' as const,
          required: false, formula: 'quantity * wholesalePrice', formulaPrecision: 2,
        },
        {
          key: 'lineRemark', label: '备注', type: 'text' as const,
          required: false, maxLength: 200,
        },
      ],
    },

    // ─── 展示字段区 ──────────────────────────────────
    {
      key: 'monthlySalesAmount',
      label: '本月销售额',
      type: 'money' as const,
      required: false,
      disabled: true,
      previewTrigger: ['customerId'],
    },
    {
      key: 'monthlyApprovedExpense',
      label: '本月已审批费用额',
      type: 'money' as const,
      required: false,
      disabled: true,
      previewTrigger: ['customerId'],
    },
    {
      key: 'expenseRatio',
      label: '费销比',
      type: 'formula' as const,
      required: false,
      suffix: '%',
      formula: 'monthlySalesAmount > 0 ? (monthlyApprovedExpense + (expenseType == "cash" ? cashAmount : sum(goodsList.quantity * goodsList._costPrice * goodsList._unitFactor))) / monthlySalesAmount * 100 : 0',
      formulaPrecision: 2,
    },

    // ─── 系统回填字段 ──────────────────────────────────
    {
      key: '_contractStr',
      label: '兑付协议单号',
      type: 'text' as const,
      required: false,
      disabled: true,
    },
    {
      key: '_expenditureBillStr',
      label: '客户费用单号',
      type: 'text' as const,
      required: false,
      disabled: true,
      visibleWhen: { field: 'expenseType', operator: '==' as const, value: 'cash' },
    },
  ],
  internalFields: [
    { key: '_duplicateWarning', label: '防重提示', type: 'text' as const, required: false },
    { key: '_contractId', label: '协议ID', type: 'number' as const, required: false },
    { key: '_contractDetailId', label: '协议明细ID', type: 'number' as const, required: false },
    { key: '_expenditureBillId', label: '费用单ID', type: 'number' as const, required: false },
  ],
};

// =====================================================
// 辅助函数
// =====================================================

/** 生成近12个月的年月选项 */
function generateMonthOptions(): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    options.push({ value: `${year}-${month}`, label: `${year}年${month}月` });
  }
  return options;
}

// =====================================================
// computePreview / beforeSubmit：计算展示字段
// =====================================================

async function computeMarketExpensePreview(
  formData: Record<string, unknown>,
  _userId: number
): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  const consumerId = formData.customerId as string;

  if (!consumerId) return result;

  // 1. 本月销售额
  try {
    const monthEnd = beijingDate();            // YYYY-MM-DD
    const monthStart = monthEnd.slice(0, 8) + '01'; // 当月1号
    const salesDetails = await fetchSalesDetails(monthStart, monthEnd);
    const customerSales = salesDetails.filter(d => d.consumerId === Number(consumerId));
    result.monthlySalesAmount = customerSales.reduce(
      (sum, d) => sum + parseFloat(d.financeSalesAmount || '0'), 0
    );
  } catch (e) {
    log.warn('查询本月销售额失败:', e instanceof Error ? e.message : e);
    result.monthlySalesAmount = 0;
  }

  // 2. 本月已审批费用额（从 OA 审批记录查询）
  try {
    const currentMonth = beijingDate().slice(0, 7); // YYYY-MM
    const billResult = await query(
      `SELECT COALESCE(SUM(
         CASE
           WHEN form_data->>'expenseType' = 'cash' THEN (form_data->>'cashAmount')::numeric
           ELSE (
             SELECT COALESCE(SUM(
               COALESCE((item->>'quantity')::numeric, 0) *
               COALESCE((item->>'_costPrice')::numeric, 0) *
               COALESCE((item->>'_unitFactor')::numeric, 1)
             ), 0)
             FROM jsonb_array_elements(form_data->'goodsList') AS item
           )
         END
       ), 0) AS total
       FROM oa_approval_instances i
       JOIN oa_form_types ft ON i.form_type_id = ft.id
       WHERE ft.code = 'market_expense'
         AND i.status = 'approved'
         AND form_data->>'customerId' = $1
         AND (form_data->'belongMonths' ? $2 OR form_data->>'periodType' = 'once')`,
      [consumerId, currentMonth]
    );
    result.monthlyApprovedExpense = parseFloat(billResult.rows[0]?.total || '0');
  } catch (e) {
    log.warn('查询本月已审批费用额失败:', e instanceof Error ? e.message : e);
    result.monthlyApprovedExpense = 0;
  }

  return result;
}

async function beforeSubmitMarketExpense(
  formData: Record<string, unknown>,
  userId: number
): Promise<Record<string, unknown>> {
  return computeMarketExpensePreview(formData, userId);
}

// =====================================================
// onApproved: auto 节点回调
// =====================================================

async function handleMarketExpenseAutoNode(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<CallbackResult | void> {
  const currentNodeResult = await query<{ node_order: number; node_name: string }>(
    `SELECT node_order, node_name FROM oa_approval_nodes
     WHERE instance_id = $1 AND node_type = 'auto' AND status = 'processing'
     ORDER BY node_order LIMIT 1`,
    [instance.id]
  );

  const nodeOrder = currentNodeResult.rows[0]?.node_order;
  const nodeName = currentNodeResult.rows[0]?.node_name;
  log.info(`[市场费用] auto节点执行: instanceId=${instance.id}, node=${nodeOrder}(${nodeName})`);

  switch (nodeOrder) {
    case 3:
      return handleCreateContract(instance, formData);
    case 4:
      return handleCreateExpenditure(instance, formData);
    default:
      log.warn(`[市场费用] 未知的auto节点: nodeOrder=${nodeOrder}`);
  }
}

/** 节点3: 创建兑付协议 */
async function handleCreateContract(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<CallbackResult> {
  const expenseType = formData.expenseType as string;
  const isGoods = expenseType === 'goods';
  const chargeSubject = formData.chargeSubject as string;
  const subject = MARKET_EXPENSE_SUBJECTS[chargeSubject as keyof typeof MARKET_EXPENSE_SUBJECTS];

  // 将品牌内部 ID 转换为 ERP 业务 API 所需的 originBrandId
  const originBrandId = await resolveBrandOriginId(formData.chargeBrandId as number | string | null);

  const params = {
    type: (isGoods ? 'CHARGE_CONTRACT_GOODS' : 'CHARGE_CONTRACT_CASH') as 'CHARGE_CONTRACT_CASH' | 'CHARGE_CONTRACT_GOODS',
    chargeType: subject?.chargeType || Number(chargeSubject),
    chargeTypeName: subject?.name || chargeSubject,
    chargeBrandId: originBrandId,
    name: instance.title || '市场费用申请',
    consumerId: Number(formData.customerId),
    consumerName: (formData._customerName as string) || '',
    details: [] as any[],
    workDate: beijingDate(),
    note: [instance.instance_no, formData.remark].filter(Boolean).join('+'),
  };

  if (isGoods) {
    const goodsList = (formData.goodsList as Array<Record<string, unknown>>) || [];
    params.details = goodsList.map(line => ({
      amount: String(line.amount || 0),
      fulfillPrice: '0',
      goodsId: Number(line.goodsId),
      goodsPrice: String(line.wholesalePrice || 0),
      goodsQuantity: String(line.quantity || 0),
      goodsUnitTag: resolveGoodsUnitTag(line),
    }));
  } else {
    params.details = [{ amount: String(formData.cashAmount || 0) }];
  }

  const result = await createChargeContract(params);

  // 从详情接口获取 contractId 和 contractDetailId
  let contractId = 0;
  let contractDetailId = 0;
  try {
    const detail = await getChargeContractDetail(result.contractStr);
    contractId = detail.billId;
    contractDetailId = detail.detailIds[0] || 0;
  } catch (e) {
    log.warn('查询协议详情失败:', e instanceof Error ? e.message : e);
  }

  return {
    erpMeta: {
      contractStr: result.contractStr,
      contractState: result.state,
      contractId,
      contractDetailId,
    },
    formData: {
      _contractStr: result.contractStr,
      _contractId: contractId,
      _contractDetailId: contractDetailId,
    },
  };
}

/** 节点4: 兑付生成客户费用单（仅现金） */
async function handleCreateExpenditure(
  _instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<CallbackResult | void> {
  if (formData.expenseType !== 'cash') return; // 商品场景跳过

  const erpMeta = getErpMeta(_instance);
  const contractStr = (erpMeta?.responseData?.contractStr as string) || (formData._contractStr as string);
  const contractId = (erpMeta?.responseData?.contractId as number) || (formData._contractId as number) || 0;
  const contractDetailId = (erpMeta?.responseData?.contractDetailId as number) || (formData._contractDetailId as number) || 0;
  const chargeSubject = formData.chargeSubject as string;
  const subject = MARKET_EXPENSE_SUBJECTS[chargeSubject as keyof typeof MARKET_EXPENSE_SUBJECTS];

  if (!contractStr) {
    throw new Error('未找到已创建的兑付协议，无法生成费用单');
  }

  // 将品牌内部 ID 转换为 ERP 业务 API 所需的 originBrandId
  const originBrandId = await resolveBrandOriginId(formData.chargeBrandId as number | string | null);

  const result = await createCustomerExpenditure({
    traderId: Number(formData.customerId),
    traderName: (formData._customerName as string) || '',
    totalAmount: Number(formData.cashAmount || 0),
    subjectId: subject?.chargeType || Number(chargeSubject),
    subjectName: subject?.name || chargeSubject,
    contractStr,
    contractId,
    contractDetailId,
    note: [_instance.instance_no, formData.remark].filter(Boolean).join('+'),
    brandId: originBrandId,
  });

  return {
    erpMeta: {
      expenditureBillId: result.id,
      expenditureBillStr: result.billStr,
    },
    formData: {
      _expenditureBillStr: result.billStr,
      _expenditureBillId: result.id,
    },
  };
}

// =====================================================
// onRejected: 驳回回滚
// =====================================================

async function handleMarketExpenseRejected(
  instance: OaInstanceRow,
  formData: Record<string, unknown>
): Promise<void> {
  const erpMeta = getErpMeta(instance);
  const responseData = erpMeta?.responseData;

  if (!responseData) {
    log.info(`[市场费用] 驳回时无 ERP 单据需回滚: instanceId=${instance.id}`);
    return;
  }

  const failures: string[] = [];

  // 现金场景: 反审核费用单 -> 取消费用单
  const expenditureBillId = responseData.expenditureBillId as number;
  if (formData.expenseType === 'cash' && expenditureBillId) {
    try {
      await cleanupExpenditureBill(expenditureBillId);
      log.info(`[市场费用] 费用单已清理: billId=${expenditureBillId}`);
    } catch (e) {
      const msg = `取消费用单失败(billId=${expenditureBillId}): ${e instanceof Error ? e.message : e}`;
      log.error(msg);
      failures.push(msg);
    }
  }

  // 两种场景: 终止兑付协议
  const contractStr = responseData.contractStr as string;
  if (contractStr) {
    try {
      await terminateChargeContract(contractStr);
      log.info(`[市场费用] 兑付协议已终止: ${contractStr}`);
    } catch (e) {
      const msg = `终止兑付协议失败(${contractStr}): ${e instanceof Error ? e.message : e}`;
      log.error(msg);
      failures.push(msg);
    }
  }

  if (failures.length > 0) {
    throw new Error(`市场费用回滚部分失败: ${failures.join('; ')}`);
  }
}

// =====================================================
// 表单类型定义
// =====================================================

export const marketExpenseFormType: FormTypeDefinition = {
  code: 'market_expense',
  name: '市场费用申请',
  icon: 'FundOutlined',
  category: 'marketing',
  sortOrder: 230,
  description: '申请市场费用（陈列费、临期处理费等），审批通过后自动创建ERP兑付协议',
  version: 1,

  formSchema: marketExpenseFormSchema,

  workflowDef: {
    nodes: [
      {
        order: 1,
        name: '营销经理审批',
        type: 'approval',
        handler: { roleCode: OA_ROLE.MARKETING_MGR },
        signMode: 'or',
      },
      {
        order: 2,
        name: '总经理审批',
        type: 'approval',
        handler: { roleCode: OA_ROLE.GM },
        signMode: 'or',
      },
      {
        order: 3,
        name: '创建ERP兑付协议',
        type: 'auto',
      },
      {
        order: 4,
        name: '兑付生成客户费用单',
        type: 'auto',
      },
    ],
  },

  duplicateCheck: {
    matchFields: ['customerId', 'chargeSubject', 'belongMonths'],
    includeStatuses: ['processing', 'approved'],
    displayFields: ['chargeSubject', 'cashAmount', 'belongMonths'],
    subjectLabel: '该客户',
  },

  beforeSubmit: beforeSubmitMarketExpense,
  computePreview: computeMarketExpensePreview,
  onApproved: handleMarketExpenseAutoNode,
  onRejected: handleMarketExpenseRejected,

  nodeBackfills: [
    {
      nodeOrder: 3,
      description: 'ERP兑付协议创建后回填单号',
      erpMetaFields: ['contractStr', 'contractState', 'contractId', 'contractDetailId'],
      formDataFields: ['_contractStr', '_contractId', '_contractDetailId'],
    },
    {
      nodeOrder: 4,
      description: '客户费用单创建后回填单号',
      erpMetaFields: ['expenditureBillId', 'expenditureBillStr'],
      formDataFields: ['_expenditureBillStr', '_expenditureBillId'],
    },
  ],
};

export default marketExpenseFormType;
