/**
 * 应收对账 — 表单类型定义
 * @module services/oa/form-types/customer-reconciliation
 *
 * 应收对账流程：
 * 1. 发起人：选客户 → 选应收单据 → 选领出/打印需求
 * 2. Auto：创建客户对账单（ERP）
 * 3. Auto：上传对账单 PDF
 * 4. 结算会计：单据准备（直接通过）
 * 5. 发起人：确认单据领出（手写签名）
 * 6. 发起人：提交对账结果（可选差异）
 * 7. 往来会计：差异审核（条件节点）
 * 8. Auto：审核客户对账单（ERP）
 */

import {
  FormTypeDefinition,
  FormField,
  FormSchema,
  WorkflowNodeDef,
} from '../oa.types';
import { OA_ROLE } from '../oa-role-codes';
import { createLogger } from '../../../utils/logger';
import { appQuery } from '../../../db/appPool';
import {
  handleCustomerReconciliationAutoNode,
} from '../customer-reconciliation-callback';

const log = createLogger('CustomerReconciliationForm');

// =====================================================
// 常量
// =====================================================

/** 对账单 billType（客户对账单固定 53） */
export const RECONCILIATION_BILL_TYPE = 53;

/** 对账单业务员 ID（固定值） */
export const RECONCILIATION_SALESMAN_ID = 97;

/** 差异原因选项 */
export const DIFFERENCE_REASONS = [
  { value: 'price_error', label: '销售单价错误' },
  { value: 'missing_fee', label: '未录入费用' },
  { value: 'other', label: '其他' },
] as const;

// =====================================================
// formSchema
// =====================================================

const reconciliationFormSchema: FormSchema = {
  fields: [
    // ═══ 发起阶段：基础信息 ═══
    {
      key: 'customerId',
      label: '客户',
      type: 'select',
      required: true,
      searchApi: 'erp_customers',
      nameField: '_customerName',
      autoFill: { _customerName: 'name' },
    },

    {
      key: 'receivableOrderIds',
      label: '应收单据',
      type: 'table',
      required: true,
      multiple: true,
      searchApi: 'erp_settlement_orders',
      cascadeParams: { consumerId: 'customerId' },
      defaultQueryParams: { writeOffQueryStates: 'INIT,PART', consumerCollectTypes: 'NORMAL', queryDebt: false },
      valueKey: 'id',
      labelKey: 'bizOrderStr',
      amountKey: 'leftAmount',
      paginated: true,
      statField: [
        { componentId: 'leftAmount', label: '剩余欠款合计' },
      ],
      columns: [
        { title: '单据日期', dataIndex: 'workTime', format: 'date' as const },
        { title: '订单号', dataIndex: 'bizOrderStr' },
        { title: '单据类型', dataIndex: 'billTypeName' },
        { title: '单据金额', dataIndex: 'totalAmount', format: 'money' as const, align: 'right' as const },
        { title: '剩余欠款', dataIndex: 'leftAmount', format: 'money' as const, align: 'right' as const },
      ],
      children: [
        { key: 'workTime', label: '单据日期', type: 'date', required: false, disabled: true },
        { key: 'bizOrderStr', label: '订单号', type: 'text', required: false, disabled: true },
        { key: 'billTypeName', label: '单据类型', type: 'text', required: false, disabled: true },
        { key: 'totalAmount', label: '单据金额', type: 'money', required: false, disabled: true },
        { key: 'leftAmount', label: '剩余欠款', type: 'money', required: false, disabled: true },
        { key: 'bizOrderNote', label: '订单备注', type: 'text', required: false, disabled: true },
      ],
      filters: [
        { type: 'date-range' as const, key: 'dateRange', label: '单据日期' },
      ],
      visibleWhen: { field: 'customerId', operator: 'not_empty' as const },
    },

    {
      key: 'needOriginalDocs',
      label: '单据领出需求',
      type: 'select',
      required: true,
      options: [
        { value: 'need_original', label: '需领出原始单据' },
        { value: 'no_original', label: '无需领出原始单据' },
      ],
    },

    {
      key: 'needPrintStatement',
      label: '对账单打印需求',
      type: 'select',
      required: true,
      options: [
        { value: 'need_print', label: '需打印对账单' },
        { value: 'no_print', label: '无需打印对账单' },
      ],
    },

    // ═══ 节点5：发起人确认领出 ═══
    {
      key: 'pickupSignature',
      label: '领出单据确认',
      type: 'signature',
      required: true,
    },

    // ═══ Auto节点回填：对账单号 + PDF ═══
    {
      key: 'erpStatementNo',
      label: 'ERP对账单号',
      type: 'text',
      required: false,
      disabled: true,
      placeholder: '对账单创建后自动生成',
    },

    {
      key: 'erpStatementPdf',
      label: '对账单PDF',
      type: 'upload',
      required: false,
      maxCount: 1,
    },

    // ═══ 节点6：提交对账结果 ═══
    {
      key: 'reconciliationResult',
      label: '对账结果',
      type: 'select',
      required: true,
      options: [
        { value: 'reconciled', label: '已对账' },
        { value: 'not_reconciled', label: '未对账' },
        { value: 'partial_reconciled', label: '部分对账' },
      ],
    },

    {
      key: 'reconciliationReceipt',
      label: '对账回单',
      type: 'upload',
      required: false,
      accept: 'image/*',
      visibleWhen: {
        match: 'any' as const,
        conditions: [
          { field: 'reconciliationResult', operator: '==' as const, value: 'reconciled' },
          { field: 'reconciliationResult', operator: '==' as const, value: 'partial_reconciled' },
        ],
      },
      requiredWhen: {
        match: 'any' as const,
        conditions: [
          { field: 'reconciliationResult', operator: '==' as const, value: 'reconciled' },
          { field: 'reconciliationResult', operator: '==' as const, value: 'partial_reconciled' },
        ],
      },
    },

    {
      key: 'unreconciledOrderIds',
      label: '未对账应收单据',
      type: 'table',
      required: true,
      multiple: true,
      searchApi: 'erp_settlement_orders',
      defaultQueryParams: { writeOffQueryStates: 'INIT,PART', consumerCollectTypes: 'NORMAL', queryDebt: false },
      scopeFromField: 'receivableOrderIds',
      valueKey: 'id',
      labelKey: 'bizOrderStr',
      amountKey: 'leftAmount',
      paginated: true,
      statField: [
        { componentId: 'leftAmount', label: '剩余欠款合计' },
      ],
      columns: [
        { title: '单据日期', dataIndex: 'workTime', format: 'date' as const },
        { title: '订单号', dataIndex: 'bizOrderStr' },
        { title: '单据类型', dataIndex: 'billTypeName' },
        { title: '单据金额', dataIndex: 'totalAmount', format: 'money' as const, align: 'right' as const },
        { title: '剩余欠款', dataIndex: 'leftAmount', format: 'money' as const, align: 'right' as const },
      ],
      children: [
        { key: 'workTime', label: '单据日期', type: 'date', required: false, disabled: true },
        { key: 'bizOrderStr', label: '订单号', type: 'text', required: false, disabled: true },
        { key: 'billTypeName', label: '单据类型', type: 'text', required: false, disabled: true },
        { key: 'totalAmount', label: '单据金额', type: 'money', required: false, disabled: true },
        { key: 'leftAmount', label: '剩余欠款', type: 'money', required: false, disabled: true },
      ],
      filters: [
        { type: 'date-range' as const, key: 'dateRange', label: '单据日期' },
      ],
      visibleWhen: [
        { field: 'customerId', operator: 'not_empty' as const },
        { field: 'reconciliationResult', operator: '==' as const, value: 'partial_reconciled' },
      ],
    },

    {
      key: 'differenceStatus',
      label: '差异情况',
      type: 'select',
      required: true,
      options: [
        { value: 'no_difference', label: '无差异' },
        { value: 'has_difference', label: '存在差异' },
      ],
      visibleWhen: {
        match: 'any' as const,
        conditions: [
          { field: 'reconciliationResult', operator: '==' as const, value: 'reconciled' },
          { field: 'reconciliationResult', operator: '==' as const, value: 'partial_reconciled' },
        ],
      },
    },

    {
      key: 'differenceReasons',
      label: '差异原因',
      type: 'select',
      required: true,
      multiple: true,
      options: [
        { value: 'price_error', label: '销售单价错误' },
        { value: 'missing_fee', label: '未录入费用' },
        { value: 'other', label: '其他' },
      ],
      visibleWhen: { field: 'differenceStatus', operator: '==' as const, value: 'has_difference' },
    },

    {
      key: 'differenceRemark',
      label: '差异原因说明',
      type: 'textarea',
      required: true,
      maxLength: 1000,
      visibleWhen: { field: 'differenceStatus', operator: '==' as const, value: 'has_difference' },
    },

    // ═══ 节点7：差异处理单据 ═══
    {
      key: 'differenceOrderIds',
      label: '差异处理单据',
      type: 'table',
      required: true,
      multiple: true,
      searchApi: 'erp_settlement_orders',
      cascadeParams: { consumerId: 'customerId' },
      defaultQueryParams: { writeOffQueryStates: 'INIT,PART', consumerCollectTypes: 'NORMAL', queryDebt: false },
      valueKey: 'id',
      labelKey: 'bizOrderStr',
      amountKey: 'leftAmount',
      paginated: true,
      columns: [
        { title: '单据日期', dataIndex: 'workTime', format: 'date' as const },
        { title: '订单号', dataIndex: 'bizOrderStr' },
        { title: '单据类型', dataIndex: 'billTypeName' },
        { title: '单据金额', dataIndex: 'totalAmount', format: 'money' as const, align: 'right' as const },
        { title: '剩余欠款', dataIndex: 'leftAmount', format: 'money' as const, align: 'right' as const },
      ],
      children: [
        { key: 'workTime', label: '单据日期', type: 'date', required: false, disabled: true },
        { key: 'bizOrderStr', label: '订单号', type: 'text', required: false, disabled: true },
        { key: 'billTypeName', label: '单据类型', type: 'text', required: false, disabled: true },
        { key: 'totalAmount', label: '单据金额', type: 'money', required: false, disabled: true },
        { key: 'leftAmount', label: '剩余欠款', type: 'money', required: false, disabled: true },
      ],
      filters: [
        { type: 'date-range' as const, key: 'dateRange', label: '单据日期' },
      ],
      visibleWhen: [
        { field: 'customerId', operator: 'not_empty' as const },
        { field: 'differenceStatus', operator: '==' as const, value: 'has_difference' },
      ],
    },
  ],

  // ═══ 系统内部字段（不参与权限校验和前端渲染） ═══
  internalFields: [
    { key: '_customerName', label: '客户名称', type: 'text', required: false },
    { key: '_erpStatementId', label: 'ERP对账单ID', type: 'text', required: false },
    { key: '_erpStatementNo', label: 'ERP对账单号', type: 'text', required: false },
    { key: '_salesmanId', label: '业务员ID', type: 'text', required: false },
    { key: '_erpStatementDetail', label: 'ERP对账单明细JSON', type: 'text', required: false },
    { key: '_statementPdfUrl', label: '对账单PDF地址', type: 'text', required: false },
  ],
};

// =====================================================
// workflowDef
// =====================================================

const reconciliationWorkflowDef: { nodes: WorkflowNodeDef[] } = {
  nodes: [
    {
      order: 2,
      name: '创建客户对账单',
      type: 'auto',
    },
    {
      order: 3,
      name: '上传对账单PDF',
      type: 'auto',
    },
    {
      order: 4,
      name: '单据准备',
      type: 'handle',
      handler: { roleCode: OA_ROLE.CASHIER },
      signMode: 'or',
    },
    {
      order: 5,
      name: '确认单据领出',
      type: 'handle',
      handler: { useApplicant: true },
      signMode: 'or',
    },
    {
      order: 6,
      name: '提交对账结果',
      type: 'handle',
      handler: { useApplicant: true },
      signMode: 'or',
    },
    {
      order: 7,
      name: '差异审核',
      type: 'handle',
      handler: { roleCode: OA_ROLE.ACCOUNTANT },
      signMode: 'or',
      condition: { field: 'differenceStatus', operator: '==' as const, value: 'has_difference' },
    },
    {
      order: 8,
      name: '审核客户对账单',
      type: 'auto',
    },
  ],
};

// =====================================================
// beforeSubmit
// =====================================================

async function beforeSubmitCustomerReconciliation(
  formData: Record<string, unknown>,
  userId: number
): Promise<Record<string, unknown>> {
  // 1. 校验
  const customerId = formData.customerId;
  if (!customerId) throw new Error('请选择客户');

  const orderIds = formData.receivableOrderIds as string[];
  if (!orderIds?.length) throw new Error('请选择应收单据');

  // 3. 防重已迁移至通用查重引擎（duplicateCheck 配置）

  return {};
}

// =====================================================
// 表单类型定义
// =====================================================

export const customerReconciliationFormType: FormTypeDefinition = {
  code: 'customer_reconciliation',
  name: '应收对账',
  icon: 'AuditOutlined',
  category: 'finance',
  sortOrder: 100,
  description: '结算会计与客户之间的应收对账流程，支持对账单创建、单据领出、差异审核',
  version: 2,

  formSchema: reconciliationFormSchema,
  workflowDef: reconciliationWorkflowDef,

  beforeSubmit: beforeSubmitCustomerReconciliation,
  onApproved: handleCustomerReconciliationAutoNode,

  /** 通用查重配置：同客户 = 重复 */
  duplicateCheck: {
    matchFields: ['customerId'],
    includeStatuses: ['processing', 'approved'],
    displayFields: ['title'],
    subjectLabel: '该客户',
  },

  nodeBackfills: [
    {
      nodeOrder: 2,
      description: '创建客户对账单草稿',
      erpMetaFields: ['erpStatementId', 'erpStatementState', 'consumerCollectStr'],
      formDataFields: ['_erpStatementId', '_erpStatementDetail', '_erpStatementNo', 'erpStatementNo'],
    },
    {
      nodeOrder: 3,
      description: '上传对账单PDF',
      erpMetaFields: ['pdfUrl'],
      formDataFields: ['_statementPdfUrl', 'erpStatementPdf'],
    },
    {
      nodeOrder: 8,
      description: '审核客户对账单',
      erpMetaFields: ['statementApproved', 'approvedAt', 'consumerCollectStr'],
    },
  ],
};

export default customerReconciliationFormType;
