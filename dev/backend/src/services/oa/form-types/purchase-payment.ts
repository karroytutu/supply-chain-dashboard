/**
 * 采购付款申请单 - 表单类型定义
 * @module services/oa/form-types/purchase-payment
 *
 * 支持两种付款模式：
 * - 后付款（postpay）：选择供应商应付单据，审批后创建 ERP 付款单核销
 * - 预付款（prepay）：手动填写预付金额，审批后创建 ERP 普通预付款单
 *
 * 审批流程：财务审批 → 条件总经理(>5万) → 出纳支付 → ERP自动操作 → 抄送会计
 */

import { FormTypeDefinition, FormSchema, PreviewContextResult } from '../oa.types';
import { OA_ROLE } from '../oa-role-codes';
import { appQuery as query } from '../../../db/appPool';
import { createLogger } from '../../../utils/logger';
import {
  handlePurchasePaymentAutoNode,
  handlePurchasePaymentRejected,
} from '../../purchase-payment/purchase-payment-callback';

const log = createLogger('PurchasePaymentForm');

// =====================================================
// 付款类型常量
// =====================================================

export const PAYMENT_TYPE = {
  PREPAY: 'prepay',
  POSTPAY: 'postpay',
} as const;

// =====================================================
// formSchema
// =====================================================

const purchasePaymentFormSchema: FormSchema = {
  fields: [
    // ═══ 区域一：基础信息 ═══
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
      key: 'paymentType',
      label: '付款类型',
      type: 'select',
      required: true,
      options: [
        { value: PAYMENT_TYPE.PREPAY, label: '预付款' },
        { value: PAYMENT_TYPE.POSTPAY, label: '后付款' },
      ],
    },

    // ═══ 区域二：后付款专属字段（条件显示） ═══
    {
      key: 'debtIds',
      label: '应付单据',
      type: 'modal_select',
      required: false,
      multiple: true,
      searchApi: 'erp_supplier_debts',
      cascadeParams: { traderId: 'supplierId' },
      valueKey: 'bizId',
      labelKey: 'bizStr',
      amountKey: 'leftAmount',
      paginated: true,
      columns: [
        { title: '单据日期', dataIndex: 'workTime', format: 'date' },
        { title: '单据编号', dataIndex: 'bizStr' },
        { title: '单据类型', dataIndex: 'billTypeName' },
        { title: '应付金额', dataIndex: 'totalAmount', format: 'money' },
        { title: '剩余金额', dataIndex: 'leftAmount', format: 'money' },
      ],
      filters: [
        { type: 'date-range' as const, key: 'dateRange', label: '单据日期' },
      ],
      searchPlaceholder: '搜索单据编号',
      visibleWhen: [
        { field: 'supplierId', operator: 'not_empty' },
        { field: 'paymentType', operator: '==', value: PAYMENT_TYPE.POSTPAY },
      ],
    },
    {
      key: 'totalPayableAmount',
      label: '应付总额',
      type: 'money',
      required: false,
      disabled: true,
      upper: true,
      visibleWhen: { field: 'paymentType', operator: '==', value: PAYMENT_TYPE.POSTPAY },
    },
    {
      key: 'discountAmount',
      label: '抹零金额',
      type: 'money',
      required: false,
      visibleWhen: { field: 'paymentType', operator: '==', value: PAYMENT_TYPE.POSTPAY },
    },
    {
      key: 'paymentAmount',
      label: '需付款金额',
      type: 'money',
      required: false,
      upper: true,
      visibleWhen: { field: 'paymentType', operator: '==', value: PAYMENT_TYPE.POSTPAY },
    },

    // ═══ 区域三：预付款专属字段（条件显示） ═══
    {
      key: 'prepayAmount',
      label: '预付金额',
      type: 'money',
      required: false,
      upper: true,
      visibleWhen: { field: 'paymentType', operator: '==', value: PAYMENT_TYPE.PREPAY },
    },

    // ═══ 区域四：通用字段 ═══
    {
      key: 'bankAccountSelector',
      label: '收款账户',
      type: 'bank_account_selector',
      required: true,
    },
    {
      key: 'remark',
      label: '备注',
      type: 'textarea',
      required: false,
      maxLength: 500,
      placeholder: '请输入备注（选填）',
    },

    // ═══ 区域五：出纳支付环节字段 ═══
    {
      key: 'paymentSubjectId',
      label: '付款账户',
      type: 'erp_payment_account',
      required: true,
      searchApi: 'erp_payment_accounts' as const,
    },
    {
      key: 'actualAmount',
      label: '实付金额',
      type: 'money',
      required: false,
      upper: true,
    },
    {
      key: 'receiptUrls',
      label: '付款回单',
      type: 'upload',
      required: false,
      maxCount: 5,
    },

    // ═══ 区域六：ERP回填字段（auto节点后可见） ═══
    {
      key: 'erpBillStr',
      label: 'ERP单据号',
      type: 'text',
      required: false,
      disabled: true,
    },
  ],

  // 系统数据：不参与权限配置和前端渲染
  internalFields: [
    { key: 'supplierName', label: '供应商名称', type: 'text', required: false },
    { key: '_approvalAmount', label: '审批金额', type: 'number', required: false },
    { key: '_supplierId', label: '供应商ID', type: 'text', required: false },
  ],
};

// =====================================================
// workflowDef
// =====================================================

const purchasePaymentWorkflowDef = {
  nodes: [
    {
      order: 1,
      name: '财务审批',
      type: 'approval' as const,
      handler: { roleCode: OA_ROLE.ACCOUNTANT },
      signMode: 'or' as const,
    },
    {
      order: 2,
      name: '总经理审批',
      type: 'approval' as const,
      handler: { roleCode: OA_ROLE.GM },
      signMode: 'or' as const,
      condition: { field: '_approvalAmount', operator: '>' as const, value: 50000 },
      conditionDescription: '付款金额 > 50000元',
    },
    {
      order: 3,
      name: '出纳支付',
      type: 'handle' as const,
      handler: { roleCode: OA_ROLE.CASHIER },
      signMode: 'or' as const,
    },
    {
      order: 4,
      name: 'ERP自动操作',
      type: 'auto' as const,
    },
    {
      order: 5,
      name: '抄送往来会计',
      type: 'cc' as const,
      ccRoles: [OA_ROLE.ACCOUNTANT],
    },
  ],
};

// =====================================================
// beforeSubmit: 防重校验 + 数据增强
// =====================================================

async function beforeSubmitPurchasePayment(
  formData: Record<string, unknown>,
  _userId: number
): Promise<Record<string, unknown>> {
  const supplierId = formData.supplierId as string;
  const paymentType = formData.paymentType as string;

  if (!supplierId) {
    throw new Error('请选择供应商');
  }

  // 1. 防重校验：同一供应商不能有两个在途/已完成的采购付款申请
  try {
    const existingResult = await query(
      `SELECT i.instance_no, i.title, i.status
       FROM oa_approval_instances i
       JOIN oa_form_types ft ON i.form_type_id = ft.id
       WHERE ft.code = 'purchase_payment'
         AND i.status NOT IN ('rejected', 'withdrawn', 'cancelled')
         AND i.form_data->>'supplierId' = $1
       LIMIT 1`,
      [supplierId]
    );
    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      const statusLabel = existing.status === 'approved' ? '已完成审批' : '已在审批流程中';
      throw new Error(
        `该供应商${statusLabel}（单号：${existing.instance_no}），不能重复提交`
      );
    }
  } catch (dbError) {
    if (dbError instanceof Error && dbError.message.includes('不能重复提交')) {
      throw dbError;
    }
    // 防重校验查询失败时阻止提交，避免产生重复单据
    log.error('采购付款防重校验查询失败:', dbError);
    throw new Error('系统繁忙，防重校验失败，请稍后重试');
  }

  // 2. 按付款类型校验并计算 _approvalAmount
  const result: Record<string, unknown> = {
    _supplierId: supplierId,
  };

  if (paymentType === PAYMENT_TYPE.POSTPAY) {
    const debtIds = formData.debtIds as unknown[];
    if (!debtIds || debtIds.length === 0) {
      throw new Error('后付款必须选择至少一条应付单据');
    }

    const paymentAmount = parseFloat(String(formData.paymentAmount || 0));
    if (paymentAmount <= 0) {
      throw new Error('需付款金额必须大于0');
    }
    // 校验付款金额与应付总额减抹零的算术一致性
    const totalPayable = parseFloat(String(formData.totalPayableAmount || 0));
    const discount = parseFloat(String(formData.discountAmount || 0));
    const expectedPayment = Math.round((totalPayable - discount) * 100) / 100;
    if (Math.abs(paymentAmount - expectedPayment) > 0.01) {
      throw new Error(`需付款金额（${paymentAmount}）与应付总额减抹零（${expectedPayment}）不一致`);
    }
    result._approvalAmount = paymentAmount;

    // 应付单据明细已由 ModalSelectControl 自动持久化到 formData._details.debtIds，
    // auto 节点回调直接读取，无需后端快照
  } else if (paymentType === PAYMENT_TYPE.PREPAY) {
    const prepayAmount = parseFloat(String(formData.prepayAmount || 0));
    if (prepayAmount <= 0) {
      throw new Error('预付金额必须大于0');
    }
    result._approvalAmount = prepayAmount;
  } else {
    throw new Error('请选择付款类型');
  }

  return result;
}

// =====================================================
// resolvePreviewContext: 流程预览条件字段
// =====================================================

async function resolvePurchasePaymentPreviewContext(
  formData: Record<string, unknown>,
  _userId: number
): Promise<PreviewContextResult> {
  const paymentType = formData.paymentType as string;
  if (!paymentType) return { contextFields: {} };

  const amount = paymentType === PAYMENT_TYPE.PREPAY
    ? parseFloat(String(formData.prepayAmount || 0))
    : parseFloat(String(formData.paymentAmount || 0));

  return {
    contextFields: { _approvalAmount: amount },
  };
}

// =====================================================
// 表单类型定义
// =====================================================

export const purchasePaymentFormType: FormTypeDefinition = {
  code: 'purchase_payment',
  name: '采购付款申请单',
  icon: 'MoneyCollectOutlined',
  category: 'finance',
  sortOrder: 110,
  description: '采购付款申请：支持后付款（核销应付单据）和预付款两种模式',
  version: 1,

  formSchema: purchasePaymentFormSchema,
  workflowDef: purchasePaymentWorkflowDef,

  /** 提交前：防重校验 + 计算审批金额 + 快照债务明细 */
  beforeSubmit: beforeSubmitPurchasePayment,

  /** 流程预览：根据付款类型和金额计算审批条件 */
  resolvePreviewContext: resolvePurchasePaymentPreviewContext,

  /** auto 节点回填声明 */
  nodeBackfills: [
    {
      nodeOrder: 4,
      description: '出纳支付后系统自动创建ERP付款单据，回填ERP单号',
      erpMetaFields: ['erpBillId', 'erpBillStr', 'erpOperationType'],
      formDataFields: ['erpBillStr'],
    },
  ],

  /** auto节点回调：创建ERP付款单/预付款单 */
  onApproved: handlePurchasePaymentAutoNode,

  /** 驳回回滚：取消已创建的ERP单据 */
  onRejected: handlePurchasePaymentRejected,
};
