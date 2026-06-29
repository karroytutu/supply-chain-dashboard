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
      type: 'select',
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
      type: 'table',
      required: false,
      multiple: true,
      searchApi: 'erp_supplier_debts',
      cascadeParams: { traderId: 'supplierId' },
      valueKey: 'bizId',
      labelKey: 'bizStr',
      amountKey: 'leftAmount',
      editableAmount: true,
      paginated: true,
      statField: [
        { componentId: 'totalAmount', label: '应付金额合计' },
        { componentId: 'leftAmount', label: '剩余金额合计' },
        { componentId: 'paymentAmount', label: '本次付款合计' },
        { componentId: 'discountAmount', label: '本次抹零合计' },
      ],
      columns: [
        { title: '单据日期', dataIndex: 'workTime', format: 'date' as const },
        { title: '单据编号', dataIndex: 'bizStr' },
        { title: '单据类型', dataIndex: 'billTypeName' },
        { title: '应付金额', dataIndex: 'totalAmount', format: 'money' as const, align: 'right' as const },
        { title: '剩余金额', dataIndex: 'leftAmount', format: 'money' as const, align: 'right' as const },
      ],
      children: [
        { key: 'workTime', label: '单据日期', type: 'date', required: false, disabled: true },
        { key: 'bizStr', label: '单据编号', type: 'text', required: false, disabled: true },
        { key: 'billTypeName', label: '单据类型', type: 'text', required: false, disabled: true },
        { key: 'totalAmount', label: '应付金额', type: 'money', required: false, disabled: true },
        { key: 'leftAmount', label: '剩余金额', type: 'money', required: false, disabled: true },
        { key: 'paymentAmount', label: '本次付款', type: 'money', required: false },
        { key: 'discountAmount', label: '本次抹零', type: 'money', required: false },
        { key: 'remaining', label: '未结余额', type: 'formula', required: false,
          formula: 'leftAmount - paymentAmount - discountAmount' },
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

    // ═══ 区域二点五：预付款核销（后付款专属，条件显示） ═══
    {
      key: 'usePrepayWriteOff',
      label: '使用预付款核销',
      type: 'select',
      required: false,
      options: [
        { value: 'yes', label: '是' },
        { value: 'no', label: '否' },
      ],
      visibleWhen: { field: 'paymentType', operator: '==', value: PAYMENT_TYPE.POSTPAY },
    },
    {
      key: 'prepaymentIds',
      label: '预付款单',
      type: 'table',
      required: false,
      multiple: true,
      searchApi: 'erp_prepayments' as const,
      cascadeParams: { traderId: 'supplierId' },
      valueKey: 'id',
      labelKey: 'paidBillStr',
      amountKey: 'availableAmount',
      editableAmount: true,
      statField: [
        { componentId: 'totalAmount', label: '预付总额合计' },
        { componentId: 'writeOffAmount', label: '已核销合计' },
        { componentId: 'availableAmount', label: '可用余额合计' },
        { componentId: 'useAmount', label: '本次使用合计' },
      ],
      columns: [
        { title: '单据编号', dataIndex: 'paidBillStr' },
        { title: '预付总额', dataIndex: 'totalAmount', format: 'money' as const, align: 'right' as const },
        { title: '已核销', dataIndex: 'writeOffAmount', format: 'money' as const, align: 'right' as const },
        { title: '可用余额', dataIndex: 'availableAmount', format: 'money' as const, align: 'right' as const },
      ],
      children: [
        { key: 'paidBillStr', label: '单据编号', type: 'text', required: false, disabled: true },
        { key: 'totalAmount', label: '预付总额', type: 'money', required: false, disabled: true },
        { key: 'writeOffAmount', label: '已核销', type: 'money', required: false, disabled: true },
        { key: 'availableAmount', label: '可用余额', type: 'money', required: false, disabled: true },
        { key: 'useAmount', label: '本次使用金额', type: 'money', required: false },
        { key: 'remaining', label: '剩余可用金额', type: 'formula', required: false,
          formula: 'availableAmount - useAmount' },
      ],
      visibleWhen: [
        { field: 'paymentType', operator: '==', value: PAYMENT_TYPE.POSTPAY },
        { field: 'usePrepayWriteOff', operator: '==', value: 'yes' },
      ],
    },

    // ═══ 区域二点六：银行转账明细（出纳支付环节填写，支持多银行账户） ═══
    // 行内搜索下拉模式：每行一个 Select 搜索 ERP 银行账户 + 填金额
    {
      key: 'paymentLines',
      label: '银行转账明细',
      type: 'table',
      required: false,
      children: [
        {
          key: 'paymentSubjectId',
          label: '付款账户',
          type: 'select',
          required: true,
          searchApi: 'erp_payment_accounts' as const,
          nameField: 'name',
          autoFill: { name: 'name' },
        },
        { key: 'name', label: '账户名称', type: 'text', required: false, disabled: true },
        { key: 'amount', label: '实付金额', type: 'money', required: true },
      ],
      // 两种付款模式均显示（出纳环节填写，发起/审批环节通过 field_permissions 隐藏）
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
      key: 'supplierConfirmUrls',
      label: '供应商确认截图',
      type: 'upload',
      required: false,
      maxCount: 5,
    },
    {
      key: 'bankAccountSelector',
      label: '收款账户',
      type: 'bank_account_selector',
      required: true,
      cascadeFrom: 'supplierId',
    },
    {
      key: 'remark',
      label: '备注',
      type: 'textarea',
      required: false,
      maxLength: 500,
      placeholder: '请输入备注（选填）',
    },

    // ═══ 区域五：出纳支付环节字段（旧字段已隐藏，由 paymentLines 替代） ═══
    // 旧字段保留在 schema 中以兼容历史实例数据，但不再展示
    {
      key: 'paymentSubjectId',
      label: '付款账户',
      type: 'select',
      required: false,  // 已废弃，不再必填
      searchApi: 'erp_payment_accounts' as const,
      nameField: '_paymentSubjectName',
      autoFill: { _paymentSubjectName: 'name' },
      hidden: true,  // 由 paymentLines 替代
    },
    { key: '_paymentSubjectName', label: '付款账户名称', type: 'text', required: false, hidden: true },
    {
      key: 'actualAmount',
      label: '实付金额',
      type: 'money',
      required: false,
      upper: true,
      hidden: true,  // 由 paymentLines 替代
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
    { key: '_isPurePrepayWriteOff', label: '纯预付款核销', type: 'number', required: false },
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
      condition: { field: '_isPurePrepayWriteOff', operator: '==' as const, value: 0 },
      conditionDescription: '非纯预付款核销',
    },
    {
      order: 2,
      name: '总经理审批',
      type: 'approval' as const,
      handler: { roleCode: OA_ROLE.GM },
      signMode: 'or' as const,
      condition: [
        { field: '_isPurePrepayWriteOff', operator: '==' as const, value: 0 },
        { field: '_approvalAmount', operator: '>' as const, value: 50000 },
      ],
      conditionDescription: '非纯预付款核销 且 付款金额 > 50000元',
    },
    {
      order: 3,
      name: '出纳支付',
      type: 'handle' as const,
      handler: { roleCode: OA_ROLE.CASHIER },
      signMode: 'or' as const,
      condition: { field: '_isPurePrepayWriteOff', operator: '==' as const, value: 0 },
      conditionDescription: '非纯预付款核销',
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

  // 1. 防重校验已迁移至通用查重引擎（duplicateCheck 配置）

  // 2. 按付款类型校验并计算 _approvalAmount
  const result: Record<string, unknown> = {
    _supplierId: supplierId,
  };

  if (paymentType === PAYMENT_TYPE.POSTPAY) {
    const debtIds = formData.debtIds as unknown[];
    if (!debtIds || debtIds.length === 0) {
      throw new Error('后付款必须选择至少一条应付单据');
    }

    // 部分付款校验：遍历每张单据，校验本次付款金额和抹零
    const details = formData._details as Record<string, unknown> | undefined;
    const debtDetails = details?.debtIds as Array<{
      bizId: number;
      bizStr: string;
      leftAmount: string;
      paymentAmount?: string;
      discountAmount?: string;
    }> | undefined;

    if (!debtDetails || debtDetails.length === 0) {
      throw new Error('缺少应付单据明细数据');
    }

    let totalPayment = 0;
    for (const debt of debtDetails) {
      const left = parseFloat(String(debt.leftAmount || 0));
      const paid = parseFloat(String(debt.paymentAmount || 0));
      const discount = parseFloat(String(debt.discountAmount || 0));
      if (paid <= 0) throw new Error(`单据 ${debt.bizStr} 的本次付款金额必须大于0`);
      if (paid > left) throw new Error(`单据 ${debt.bizStr} 的本次付款金额不能超过剩余金额`);
      const remaining = Math.round((left - paid - discount) * 100) / 100;
      if (remaining < -0.01) {
        throw new Error(`单据 ${debt.bizStr} 的本次付款 + 抹零不能超过剩余金额`);
      }
      totalPayment += paid;
    }
    totalPayment = Math.round(totalPayment * 100) / 100;

    // 预付款核销校验：预付款核销合计不能超过需付款金额
    const prepayDetails = details?.prepaymentIds as Array<{ useAmount?: string; availableAmount?: string }> | undefined;
    const prepayTotal = (prepayDetails || []).reduce(
      (sum, p) => sum + (parseFloat(String(p.useAmount || 0))), 0
    );
    const usePrepay = formData.usePrepayWriteOff === 'yes';
    if (usePrepay && prepayTotal > 0) {
      // 逐条校验：每条预付单的核销金额不超过可用余额
      for (const p of (prepayDetails || [])) {
        const use = parseFloat(String(p.useAmount || 0));
        const avail = parseFloat(String(p.availableAmount || 0));
        if (use > avail + 0.01) {
          throw new Error(`预付款单核销金额（${use}）超过可用余额（${avail}），请检查`);
        }
      }
      if (prepayTotal > totalPayment + 0.01) {
        throw new Error(
          `预付款核销合计（${prepayTotal}）超过需付款金额（${totalPayment}），请检查`
        );
      }
    }
    // 注：完整的金额平衡校验（银行转账 + 预付款核销 = 需付款金额）
    // 在出纳支付环节完成后由 ERP 回调时校验，因为银行转账明细由出纳填写

    // 纯预付款核销判断：预付款核销合计 == 需付款金额（无银行转账部分）
    const isPurePrepayWriteOff = usePrepay && prepayTotal > 0
      && Math.abs(prepayTotal - totalPayment) < 0.02 ? 1 : 0;
    result._isPurePrepayWriteOff = isPurePrepayWriteOff;

    result._approvalAmount = totalPayment;

    // 应付单据明细已由 TableFieldRenderer 自动持久化到 formData._details.debtIds，
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

  let amount: number;
  if (paymentType === PAYMENT_TYPE.PREPAY) {
    amount = parseFloat(String(formData.prepayAmount || 0));
  } else {
    // 后付款：从单据明细中汇总本次付款金额
    const details = formData._details as Record<string, unknown> | undefined;
    const debtDetails = details?.debtIds as Array<{ paymentAmount?: string }> | undefined;
    amount = (debtDetails || []).reduce(
      (sum, d) => sum + (parseFloat(String(d.paymentAmount || 0))), 0
    );
    // 兆底：如果明细尚未填充，使用表单字段值
    if (amount <= 0) {
      amount = parseFloat(String(formData.paymentAmount || 0));
    }
  }

  // 后付款：判断是否为纯预付款核销
  let isPurePrepayWriteOff = 0;
  if (paymentType === PAYMENT_TYPE.POSTPAY) {
    // 复用上方已计算的 amount 作为后付款合计，避免重复提取 debtDetails
    const totalPayment = amount;
    const details = formData._details as Record<string, unknown> | undefined;
    const prepayDetails = details?.prepaymentIds as Array<{ useAmount?: string }> | undefined;
    const prepayTotal = (prepayDetails || []).reduce(
      (sum, p) => sum + (parseFloat(String(p.useAmount || 0))), 0
    );
    const usePrepay = formData.usePrepayWriteOff === 'yes';
    if (usePrepay && prepayTotal > 0 && Math.abs(prepayTotal - totalPayment) < 0.02) {
      isPurePrepayWriteOff = 1;
    }
  }

  return {
    contextFields: { _approvalAmount: amount, _isPurePrepayWriteOff: isPurePrepayWriteOff },
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
  version: 3,

  formSchema: purchasePaymentFormSchema,
  workflowDef: purchasePaymentWorkflowDef,

  /** 提交前：计算审批金额 + 快照债务明细（防重已迁移至通用引擎） */
  beforeSubmit: beforeSubmitPurchasePayment,

  /** 审批前校验：出纳节点（order=3）确认时校验银行转账明细是否有效 */
  beforeApprove: (nodeOrder, formData, inputData) => {
    const errors: string[] = [];
    if (nodeOrder === 3) {
      const isPurePrepay = formData._isPurePrepayWriteOff === 1 || formData._isPurePrepayWriteOff === '1';
      const paymentLines = (formData.paymentLines || inputData?.paymentLines) as Array<{
        amount?: string;
        paymentSubjectId?: number;
        id?: number;
      }> | undefined;

      if (!isPurePrepay) {
        if (!paymentLines || paymentLines.length === 0) {
          errors.push('请填写银行转账明细');
          return errors;
        }
        const validLines = paymentLines.filter(line => {
          const subjectId = line.paymentSubjectId || line.id;
          return subjectId && parseFloat(String(line.amount || 0)) > 0;
        });
        if (validLines.length === 0) {
          errors.push('银行转账明细中至少需要一条有效付款记录（金额 > 0 且已选择付款科目）');
        }
      }
    }
    return errors;
  },

  /** 通用查重配置：同供应商 = 重复 */
  duplicateCheck: {
    matchFields: ['supplierId'],
    includeStatuses: ['processing', 'approved'],
    displayFields: ['supplierName', '_approvalAmount'],
    subjectLabel: '该供应商',
  },

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
