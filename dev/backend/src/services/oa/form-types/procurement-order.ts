/**
 * 采购审批 - 表单类型定义
 * @module services/oa/form-types/procurement-order
 *
 * 采购全生命周期审批流程：
 * - ERP采购草稿关联 → 条件三级审批 → 付款分支 → 到货差异 → 多货子流程
 * - 支持三种付款方式：已付款(关联预付/收入单)、需预付(新建采购预付)、后付款
 * - 多货验收时动态创建新PO，独立审批+付款+入库
 */

import {
  FormTypeDefinition,
  FormField,
} from '../oa.types';
import { analyzePurchaseOrder, buildPurchaseLines } from '../../procurement-order/procurement-analysis';
import {
  handleProcurementAutoNode,
  handleProcurementNodeCompleted,
  handleProcurementRejected,
} from '../../procurement-order/procurement-callback';
import { OA_ROLE } from '../oa-role-codes';
import { appQuery as query } from '../../../db/appPool';
import { createLogger } from '../../../utils/logger';
const log = createLogger('ProcurementForm');

// =====================================================
// 付款方式选项
// =====================================================

export const PAYMENT_METHODS = {
  ALREADY_PAID_PREPAY: 'already_paid_prepay',
  ALREADY_PAID_INCOME: 'already_paid_income',
  NEED_PREPAY: 'need_prepay',
  POST_PAY: 'post_pay',
} as const;

// =====================================================
// formSchema
// =====================================================

const procurementFormSchema: { fields: FormField[] } = {
  fields: [
    // ═══ 区域一：采购基础信息（供应商级联选择 + 自动填充） ═══
    {
      key: 'supplierId',
      label: '供应商',
      type: 'erp_supplier',
      required: true,
      searchApi: 'erp_suppliers',
      autoFill: { supplierName: 'name' },
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
      },
    },
    { key: 'supplierName', label: '供应商名称', type: 'text', required: false, hidden: true },
    { key: 'erpBillStr', label: '采购单号', type: 'text', required: false, hidden: true },
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
      key: 'paymentMethod',
      label: '付款方式',
      type: 'select',
      required: true,
      options: [
        { value: PAYMENT_METHODS.ALREADY_PAID_PREPAY, label: '已付款（关联预付款单）' },
        { value: PAYMENT_METHODS.ALREADY_PAID_INCOME, label: '已付款（关联收入单）' },
        { value: PAYMENT_METHODS.NEED_PREPAY, label: '需预付' },
        { value: PAYMENT_METHODS.POST_PAY, label: '后付款' },
      ],
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

    // ═══ 区域二：审批条件标记（hidden，系统计算，用于条件节点过滤） ═══
    { key: '_needsMarketingApproval', label: '需营销审批', type: 'number', required: false },
    { key: '_needsFinanceApproval', label: '需财务审批', type: 'number', required: false },
    { key: '_needsManagerApproval', label: '需总经理审批', type: 'number', required: false },
    { key: '_paymentMethodCategory', label: '付款分类', type: 'text', required: false },
    { key: '_subFlowDepth', label: '子流程深度', type: 'number', required: false },

    // ═══ 区域三：已付款-关联单据（visibleWhen） ═══
    {
      key: 'settleSourceType',
      label: '关联类型',
      type: 'select',
      required: false,
      options: [
        { value: 'prepay', label: '普通预付款' },
        { value: 'income', label: '供应商收入单' },
      ],
      visibleWhen: { field: '_paymentMethodCategory', operator: '==', value: 'already_paid' },
    },
    {
      key: 'selectedPrepayIds',
      label: '已选预付款',
      type: 'text',
      required: false,
      visibleWhen: [
        { field: '_paymentMethodCategory', operator: '==', value: 'already_paid' },
        { field: 'settleSourceType', operator: '==', value: 'prepay' },
      ],
    },
    {
      key: 'selectedIncomeIds',
      label: '已选收入单',
      type: 'text',
      required: false,
      visibleWhen: [
        { field: '_paymentMethodCategory', operator: '==', value: 'already_paid' },
        { field: 'settleSourceType', operator: '==', value: 'income' },
      ],
    },
    {
      key: 'erpPaidBillStr',
      label: '付款单号',
      type: 'text',
      required: false,
      disabled: true,
      visibleWhen: { field: '_paymentMethodCategory', operator: '==', value: 'already_paid' },
    },

    // ═══ 区域四：需预付-出纳付款 ═══
    {
      key: 'paymentReceiptUrls',
      label: '付款回单',
      type: 'upload',
      required: false,
      maxCount: 10,
      visibleWhen: { field: 'paymentMethod', operator: '==', value: PAYMENT_METHODS.NEED_PREPAY },
    },
    {
      key: 'paymentSubjectId',
      label: '付款账户',
      type: 'erp_payment_account',
      required: false,
      searchApi: 'erp_payment_accounts',
      visibleWhen: { field: 'paymentMethod', operator: '==', value: PAYMENT_METHODS.NEED_PREPAY },
    },
    {
      key: 'erpPrepayBillStr',
      label: '预付款单号',
      type: 'text',
      required: false,
      disabled: true,
      visibleWhen: { field: 'paymentMethod', operator: '==', value: PAYMENT_METHODS.NEED_PREPAY },
    },

    // ═══ 区域五：到货差异处理（库管填写，发起时隐藏） ═══
    {
      key: 'receivingNote',
      label: '到货说明',
      type: 'textarea',
      required: false,
      maxLength: 500,
      visibleWhen: { field: '_nodePhase', operator: '==', value: 'warehouse_input' },
    },
    {
      key: 'discrepancyLines',
      label: '到货差异明细',
      type: 'table',
      required: false,
      visibleWhen: { field: '_nodePhase', operator: '==', value: 'warehouse_input' },
      children: [
        { key: 'goodsName', label: '商品', type: 'text', required: false },
        { key: 'orderedQty', label: '订单数量', type: 'number', required: false },
        { key: 'actualQty', label: '实收数量', type: 'number', required: false },
        { key: 'overQty', label: '多货数量', type: 'number', required: false },
        { key: 'shortageQty', label: '少货数量', type: 'number', required: false },
        {
          key: 'hasDefect',
          label: '有次品',
          type: 'select',
          required: false,
          options: [
            { value: 'Y', label: '是' },
            { value: 'N', label: '否' },
          ],
        },
        { key: 'defectNote', label: '次品说明', type: 'text', required: false },
        {
          key: 'handlingDecision',
          label: '多货处理',
          type: 'select',
          required: false,
          options: [
            { value: 'reject', label: '拒收多货' },
            { value: 'accept', label: '验收入库' },
          ],
        },
      ],
    },

    // ═══ 区域六：多货处理（动态插入节点使用，发起时隐藏） ═══
    {
      key: 'overQtyPaymentMethod',
      label: '多货付款方式',
      type: 'select',
      required: false,
      visibleWhen: { field: '_nodePhase', operator: '==', value: 'warehouse_input' },
      options: [
        { value: PAYMENT_METHODS.ALREADY_PAID_PREPAY, label: '已付款（关联预付款单）' },
        { value: PAYMENT_METHODS.ALREADY_PAID_INCOME, label: '已付款（关联收入单）' },
        { value: PAYMENT_METHODS.NEED_PREPAY, label: '需预付' },
        { value: PAYMENT_METHODS.POST_PAY, label: '后付款' },
      ],
    },
    {
      key: 'overQtyRemark',
      label: '多货处理备注',
      type: 'textarea',
      required: false,
      maxLength: 500,
      visibleWhen: { field: '_nodePhase', operator: '==', value: 'warehouse_input' },
    },

    // ═══ 区域七：ERP单据号留存（系统回填，只读，发起时隐藏） ═══
    { key: 'erpOverQtyBillStr', label: '多货新采购订单号', type: 'text', required: false, disabled: true, visibleWhen: { field: '_nodePhase', operator: '==', value: 'warehouse_input' } },
    { key: 'erpOverQtyPaidBillStr', label: '多货付款单号', type: 'text', required: false, disabled: true, visibleWhen: { field: '_nodePhase', operator: '==', value: 'warehouse_input' } },
    { key: 'completionStatus', label: '办结状态', type: 'text', required: false, disabled: true, visibleWhen: { field: '_nodePhase', operator: '==', value: 'warehouse_input' } },
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
    },
    {
      order: 2,
      name: '财务审批',
      type: 'approval' as const,
      handler: { roleCode: OA_ROLE.ACCOUNTANT },
      signMode: 'or' as const,
      condition: { field: '_needsFinanceApproval', operator: '==' as const, value: 1 },
    },
    {
      order: 3,
      name: '总经理审批',
      type: 'approval' as const,
      handler: { roleCode: OA_ROLE.GM },
      signMode: 'or' as const,
      condition: { field: '_needsManagerApproval', operator: '==' as const, value: 1 },
    },

    // ═══ Phase 2A: 已付款分支 ═══
    {
      order: 4,
      name: '选择关联单据',
      type: 'handle' as const,
      handler: { roleCode: OA_ROLE.PROCUREMENT_MGR },
      signMode: 'or' as const,
      condition: { field: '_paymentMethodCategory', operator: '==' as const, value: 'already_paid' },
      inputSchema: {
        fields: [
          {
            name: 'settleSourceType',
            label: '关联类型',
            type: 'select' as const,
            required: true,
            options: [
              { label: '普通预付款', value: 'prepay' },
              { label: '供应商收入单', value: 'income' },
            ],
          },
          { name: 'selectedPrepayId', label: '选择预付款单', type: 'text' as const, required: false },
          { name: 'selectedIncomeId', label: '选择收入单', type: 'text' as const, required: false },
        ],
      },
    },
    {
      order: 5,
      name: '创建付款单核销',
      type: 'auto' as const,
      condition: { field: '_paymentMethodCategory', operator: '==' as const, value: 'already_paid' },
    },

    // ═══ Phase 2B: 需预付分支 ═══
    {
      order: 6,
      name: '出纳付款',
      type: 'handle' as const,
      handler: { roleCode: OA_ROLE.CASHIER },
      signMode: 'or' as const,
      condition: { field: 'paymentMethod', operator: '==' as const, value: PAYMENT_METHODS.NEED_PREPAY },
      inputSchema: {
        fields: [
          { name: 'paymentAmount', label: '付款金额', type: 'amount' as const, required: true },
          {
            name: 'paymentSubjectId',
            label: '付款账户',
            type: 'erp_payment_account' as const,
            required: true,
            searchApi: 'erp_payment_accounts' as const,
          },
          { name: 'paymentReceiptUrls', label: '付款回单', type: 'upload' as const, required: true },
        ],
      },
    },
    {
      order: 7,
      name: '创建采购预付款',
      type: 'auto' as const,
      condition: { field: 'paymentMethod', operator: '==' as const, value: PAYMENT_METHODS.NEED_PREPAY },
    },

    // ═══ Phase 2C: 后付款 → 跳过 ═══

    // ═══ Phase 3: ERP审核入库 ═══
    {
      order: 8,
      name: '审核采购订单',
      type: 'auto' as const,
    },
    {
      order: 9,
      name: '库管到货确认',
      type: 'handle' as const,
      handler: { roleCode: OA_ROLE.WAREHOUSE_MGR },
      signMode: 'or' as const,
      inputSchema: {
        fields: [
          { name: 'receivingNote', label: '到货说明', type: 'text' as const, required: false },
          {
            name: 'discrepancyLines',
            label: '到货差异',
            type: 'table' as const,
            required: false,
            columns: [
              { name: 'goodsName', label: '商品', type: 'text' as const, required: true },
              { name: 'orderedQty', label: '订单数量', type: 'number' as const, required: true, readonly: true },
              { name: 'actualQty', label: '实收数量', type: 'number' as const, required: true },
              { name: 'overQty', label: '多货数量', type: 'number' as const, required: false },
              { name: 'shortageQty', label: '少货数量', type: 'number' as const, required: false },
              {
                name: 'hasDefect', label: '有次品', type: 'select' as const,
                options: [{ label: '是', value: 'Y' }, { label: '否', value: 'N' }],
              },
              {
                name: 'handlingDecision', label: '多货处理', type: 'select' as const,
                options: [{ label: '拒收多货', value: 'reject' }, { label: '验收入库', value: 'accept' }],
              },
            ],
          },
        ],
      },
    },

    // ═══ Phase 5: 办结 ═══
    {
      order: 10,
      name: '办结检查',
      type: 'auto' as const,
    },
  ],
  ccRoles: [OA_ROLE.ACCOUNTANT],
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
      `SELECT instance_no, title, status FROM oa_approval_instances
       WHERE form_type_code = 'procurement_order'
         AND status NOT IN ('rejected', 'withdrawn', 'cancelled')
         AND form_data->>'erpBillId' = $1
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

  // 确定付款方式分类
  const paymentMethod = formData.paymentMethod as string;
  let paymentMethodCategory = 'post_pay';
  if (paymentMethod === PAYMENT_METHODS.ALREADY_PAID_PREPAY || paymentMethod === PAYMENT_METHODS.ALREADY_PAID_INCOME) {
    paymentMethodCategory = 'already_paid';
  } else if (paymentMethod === PAYMENT_METHODS.NEED_PREPAY) {
    paymentMethodCategory = 'need_prepay';
  }

  return {
    erpBillStr: analysis.billStr,
    supplierId: String(analysis.supplierId),
    supplierName: analysis.supplierName,
    warehouseName: analysis.warehouseName,
    totalAmount: analysis.totalAmount.toFixed(2),
    purchaseLines,
    _needsMarketingApproval: analysis.needsMarketingApproval ? 1 : 0,
    _needsFinanceApproval: analysis.needsFinanceApproval ? 1 : 0,
    _needsManagerApproval: analysis.needsManagerApproval ? 1 : 0,
    _paymentMethodCategory: paymentMethodCategory,
    _subFlowDepth: 0,
    _analysisResult: JSON.stringify(analysis),
    // 关键 ID 供 auto 节点回调使用
    _originalBillId: erpBillId,
    _originalBillStr: analysis.billStr,
    _supplierId: String(analysis.supplierId),
  };
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
  description: '采购全生命周期审批：条件三级审批→付款分支→到货差异→多货子流程',
  version: 3,

  formSchema: procurementFormSchema,
  workflowDef: procurementWorkflowDef,

  /** 提交前：从ERP拉取数据+计算审批条件 */
  beforeSubmit: beforeSubmitProcurement,

  /** auto节点回调：创建付款单/预付款/审核PO/办结 */
  onApproved: handleProcurementAutoNode,

  /** handle节点完成回调：库管到货确认后的多货检查 */
  onNodeCompleted: handleProcurementNodeCompleted,

  /** 驳回回调：回滚已创建的ERP单据 */
  onRejected: handleProcurementRejected,
};
