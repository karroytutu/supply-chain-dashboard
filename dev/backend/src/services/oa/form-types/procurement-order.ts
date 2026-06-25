/**
 * 采购审批 - 表单类型定义
 * @module services/oa/form-types/procurement-order
 *
 * 采购审批流程：
 * - ERP采购草稿关联 → 条件三级审批 → 出纳付款(如需预付) → 审核PO
 * - 付款方式简化为"是否需要预付款"（是/否），预付金额可编辑
 * - 库管入库和核销由独立的"入库核销流程"处理（后续开发）
 */

import {
  FormTypeDefinition,
  FormField,
  FormSchema,
  PreviewContextResult,
} from '../oa.types';
import { analyzePurchaseOrder, buildPurchaseLines } from '../../procurement-order/procurement-analysis';
import {
  handleProcurementAutoNode,
} from '../../procurement-order/procurement-callback';
import { OA_ROLE } from '../oa-role-codes';
import { appQuery as query } from '../../../db/appPool';
import { createLogger } from '../../../utils/logger';
import {
  PROCUREMENT_MARKETING_APPROVAL_DAYS,
  PROCUREMENT_MANAGER_APPROVAL_AMOUNT,
} from '../../../utils/constants';
const log = createLogger('ProcurementForm');

// =====================================================
// 是否需要预付款选项
// =====================================================

export const NEED_PREPAYMENT = {
  YES: 'yes',
  NO: 'no',
} as const;

// =====================================================
// formSchema
// =====================================================

const procurementFormSchema: FormSchema = {
  fields: [
    // ═══ 区域一：采购基础信息（供应商级联选择 + 自动填充） ═══
    {
      key: 'supplierId',
      label: '供应商',
      type: 'erp_supplier',
      required: true,
      searchApi: 'erp_suppliers',
      autoFill: { supplierName: 'name' },
      nameField: 'supplierName',
    },
    {
      key: 'erpBillId',
      label: '采购订单',
      type: 'erp_purchase_order',
      required: true,
      searchApi: 'erp_purchase_orders',
      cascadeFrom: 'supplierId',
      autoFill: {
        erpBillStr: 'billStr',
        warehouseName: 'warehouseName',
        totalAmount: 'totalAmount',
        prepaymentAmount: 'totalAmount',
      },
      nameField: 'erpBillStr',
    },
    { key: 'warehouseName', label: '入库仓库', type: 'text', required: false, disabled: true },
    {
      key: 'totalAmount',
      label: '订单总金额',
      type: 'money',
      required: false,
      disabled: true,
      upper: true,
    },
    {
      key: 'needPrepayment',
      label: '是否需要预付款',
      type: 'select',
      required: true,
      options: [
        { value: NEED_PREPAYMENT.YES, label: '是' },
        { value: NEED_PREPAYMENT.NO, label: '否' },
      ],
    },
    {
      key: 'prepaymentAmount',
      label: '预付金额',
      type: 'money',
      required: false,
      upper: true,
      visibleWhen: { field: 'needPrepayment', operator: '==', value: NEED_PREPAYMENT.YES },
    },
    {
      key: 'purchaseLines',
      label: '采购明细',
      type: 'table',
      required: false,
      disabled: true,
      children: [
        { key: 'goodsName', label: '商品名称', type: 'text', required: false },
        { key: 'specification', label: '规格', type: 'text', required: false },
        { key: 'quantity', label: '数量', type: 'number', required: false },
        { key: 'unit', label: '单位', type: 'text', required: false },
        { key: 'realPrice', label: '采购价', type: 'money', required: false },
        { key: 'lastPurchasePrice', label: '上次进价', type: 'money', required: false },
        { key: 'priceDifference', label: '价差', type: 'money', required: false },
        { key: 'subAmount', label: '金额', type: 'money', required: false },
        { key: 'isFirstPurchase', label: '首次采购', type: 'text', required: false },
        { key: 'stockDisplay', label: '当前库存', type: 'text', required: false },
        { key: 'roadInDisplay', label: '在途量', type: 'text', required: false },
        { key: 'dailySalesDisplay', label: '60天日均', type: 'text', required: false },
        { key: 'sellableDays', label: '可售天数', type: 'number', required: false, suffix: '天' },
      ],
    },
    {
      key: 'purchaseRemark',
      label: '采购备注',
      type: 'textarea',
      required: false,
      placeholder: '请输入采购备注信息（选填）',
      maxLength: 500,
    },

    // ═══ 出纳付款环节字段（条件显示：仅当需要预付款时展示） ═══
    {
      key: 'bankAccountSelector',
      label: '收款账户',
      type: 'bank_account_selector',
      required: false,
      cascadeFrom: 'supplierId',
      visibleWhen: { field: 'needPrepayment', operator: '==', value: NEED_PREPAYMENT.YES },
    },
    {
      key: 'paymentAmount',
      label: '实付金额',
      type: 'money',
      required: false,
      upper: true,
      visibleWhen: { field: 'needPrepayment', operator: '==', value: NEED_PREPAYMENT.YES },
    },
    {
      key: 'paymentSubjectId',
      label: '付款账户',
      type: 'erp_payment_account',
      required: true,
      searchApi: 'erp_payment_accounts' as const,
      visibleWhen: { field: 'needPrepayment', operator: '==', value: NEED_PREPAYMENT.YES },
    },
    {
      key: 'paymentReceiptUrls',
      label: '付款回单',
      type: 'upload',
      required: false,
      maxCount: 5,
      visibleWhen: { field: 'needPrepayment', operator: '==', value: NEED_PREPAYMENT.YES },
    },
    {
      key: 'prepayBillStr',
      label: '预付款单号',
      type: 'text',
      required: false,
      disabled: true,
      visibleWhen: { field: 'needPrepayment', operator: '==', value: NEED_PREPAYMENT.YES },
    },

  ],
  // 系统数据：不参与权限配置和前端渲染
  internalFields: [
    { key: 'supplierName', label: '供应商名称', type: 'text', required: false },
    { key: 'erpBillStr', label: '采购单号', type: 'text', required: false },
    { key: '_needsMarketingApproval', label: '需营销审批', type: 'number', required: false },
    { key: '_needsFinanceApproval', label: '需财务审批', type: 'number', required: false },
    { key: '_needsManagerApproval', label: '需总经理审批', type: 'number', required: false },
  ],
};

// =====================================================
// workflowDef
// =====================================================

const procurementWorkflowDef = {
  nodes: [
    // ═══ Phase 1: 条件审批链 ═══
    {
      order: 1,
      name: '营销审批',
      type: 'approval' as const,
      handler: { roleCode: OA_ROLE.MARKETING_MGR },
      signMode: 'or' as const,
      condition: { field: '_needsMarketingApproval', operator: '==' as const, value: 1 },
      conditionDescription: `任一商品可售天数 > ${PROCUREMENT_MARKETING_APPROVAL_DAYS}天`,
    },
    {
      order: 2,
      name: '财务审批',
      type: 'approval' as const,
      handler: { roleCode: OA_ROLE.ACCOUNTANT },
      signMode: 'or' as const,
      condition: { field: '_needsFinanceApproval', operator: '==' as const, value: 1 },
      conditionDescription: '存在价差或首次采购的商品',
    },
    {
      order: 3,
      name: '总经理审批',
      type: 'approval' as const,
      handler: { roleCode: OA_ROLE.GM },
      signMode: 'or' as const,
      condition: { field: '_needsManagerApproval', operator: '==' as const, value: 1 },
      conditionDescription: `订单总金额 > ${PROCUREMENT_MANAGER_APPROVAL_AMOUNT}元`,
    },

    // ═══ Phase 2: 付款分支（需预付时） ═══
    {
      order: 4,
      name: '出纳付款',
      type: 'handle' as const,
      handler: { roleCode: OA_ROLE.CASHIER },
      signMode: 'or' as const,
      condition: { field: 'needPrepayment', operator: '==' as const, value: NEED_PREPAYMENT.YES },
    },
    {
      order: 5,
      name: '创建采购预付款',
      type: 'auto' as const,
      condition: { field: 'needPrepayment', operator: '==' as const, value: NEED_PREPAYMENT.YES },
    },

    // ═══ Phase 3: ERP审核 ═══
    {
      order: 6,
      name: '审核采购订单',
      type: 'auto' as const,
    },
    // ═══ Phase 4: 抄送 ═══
    {
      order: 7,
      name: '抄送往来会计',
      type: 'cc' as const,
      ccRoles: [OA_ROLE.ACCOUNTANT],
    },
  ],
};

// =====================================================
// beforeSubmit: 从ERP拉取数据+分析条件
// =====================================================

async function beforeSubmitProcurement(
  formData: Record<string, unknown>,
  userId: number
): Promise<Record<string, unknown>> {
  const erpBillId = formData.erpBillId as number;
  if (!erpBillId) {
    throw new Error('请选择ERP采购订单');
  }

  // 采购订单防重校验：检查是否已有其他审批实例占用该订单
  try {
    const existingResult = await query(
      `SELECT i.instance_no, i.title, i.status
       FROM oa_approval_instances i
       JOIN oa_form_types ft ON i.form_type_id = ft.id
       WHERE ft.code = 'procurement_order'
         AND i.status NOT IN ('rejected', 'withdrawn', 'cancelled')
         AND i.form_data->>'erpBillId' = $1
       LIMIT 1`,
      [String(erpBillId)]
    );
    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      const statusLabel = existing.status === 'approved' ? '已完成审批' : '已在审批流程中';
      throw new Error(
        `该采购订单${statusLabel}（单号：${existing.instance_no}），不能重复提交`
      );
    }
  } catch (dbError) {
    // 如果是业务错误（我们抛出的），直接上抛
    if (dbError instanceof Error && dbError.message.includes('不能重复提交')) {
      throw dbError;
    }
    // 数据库查询失败时记录警告但不阻止提交
    log.warn('采购订单防重校验查询失败:', dbError);
  }

  // 调用分析服务（含 8s 超时防护）
  const analysis = await analyzePurchaseOrder(erpBillId);

  // 构建行项展示数据（复用公共函数）
  const purchaseLines = buildPurchaseLines(analysis.lines);

  // 预付金额默认取订单总额（用户未手动填写时）
  const prepaymentAmount = formData.prepaymentAmount
    ? formData.prepaymentAmount
    : analysis.totalAmount.toFixed(2);

  return {
    erpBillStr: analysis.billStr,
    supplierId: String(analysis.supplierId),
    supplierName: analysis.supplierName,
    warehouseName: analysis.warehouseName,
    totalAmount: analysis.totalAmount.toFixed(2),
    purchaseLines,
    prepaymentAmount,
    _needsMarketingApproval: analysis.needsMarketingApproval ? 1 : 0,
    _needsFinanceApproval: analysis.needsFinanceApproval ? 1 : 0,
    _needsManagerApproval: analysis.needsManagerApproval ? 1 : 0,
    _analysisResult: JSON.stringify(analysis),
    // 关键 ID 供 auto 节点回调使用
    _originalBillId: erpBillId,
    _originalBillStr: analysis.billStr,
    _supplierId: String(analysis.supplierId),
  };
}

// =====================================================
// resolvePreviewContext: 流程预览条件字段注入
// =====================================================

/**
 * 流程预览上下文：根据已选采购订单计算审批条件标记
 * 与 beforeSubmit 的区别：无校验、无副作用、出错时返回空上下文
 */
async function resolveProcurementPreviewContext(
  formData: Record<string, unknown>,
  _userId: number
): Promise<PreviewContextResult> {
  const erpBillId = formData.erpBillId as number;
  // 用户尚未选择采购订单时，不计算，预览不显示条件审批环节
  if (!erpBillId) {
    return { contextFields: {} };
  }
  try {
    // 复用已有的采购订单分析函数（含可售天数>45天→需营销审批等业务规则）
    const analysis = await analyzePurchaseOrder(erpBillId);
    return {
      contextFields: {
        _needsMarketingApproval: analysis.needsMarketingApproval ? 1 : 0,
        _needsFinanceApproval: analysis.needsFinanceApproval ? 1 : 0,
        _needsManagerApproval: analysis.needsManagerApproval ? 1 : 0,
      },
    };
  } catch (error) {
    // 预览分析失败时不影响用户操作，仅降级为不显示条件审批环节
    log.warn('采购审批流程预览上下文计算失败:', error instanceof Error ? error.message : error);
    return { contextFields: {} };
  }
}

// =====================================================
// 表单类型定义
// =====================================================

export const procurementOrderFormType: FormTypeDefinition = {
  code: 'procurement_order',
  name: '采购审批',
  icon: 'ShoppingOutlined',
  category: 'supply_chain',
  sortOrder: 50,
  description: '采购审批：条件三级审批→出纳付款(如需预付)→审核PO',
  version: 10,

  formSchema: procurementFormSchema,
  workflowDef: procurementWorkflowDef,

  /** 提交前：从ERP拉取数据+计算审批条件 */
  beforeSubmit: beforeSubmitProcurement,

  /** 流程预览：根据已选采购订单动态计算需要经过哪些审批环节 */
  resolvePreviewContext: resolveProcurementPreviewContext,

  /** auto 节点回填声明 */
  nodeBackfills: [
    {
      nodeOrder: 5,
      description: '出纳付款后系统自动创建预付款单',
      erpMetaFields: ['prepayBillId', 'prepayBillStr'],
      formDataFields: ['prepayBillStr'],
    },
    {
      nodeOrder: 6,
      description: '系统自动审核采购订单',
      erpMetaFields: ['poApproved'],
    },
  ],

  /** auto节点回调：创建预付款/审核PO */
  onApproved: handleProcurementAutoNode,
};
