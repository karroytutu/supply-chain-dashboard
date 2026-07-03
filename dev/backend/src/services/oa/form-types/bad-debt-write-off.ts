/**
 * 坏账处理 — 表单类型定义
 * @module services/oa/form-types/bad-debt-write-off
 *
 * 坏账处理流程：
 * 1. 发起人：选客户 → 选应收单据 → 填坏账原因
 * 2. 总经理审批
 * 3. Auto：创建坏账费用单（ERP，subjectId=339）
 * 4. Auto：创建收款单核销（ERP，费用单与应收单据对冲，totalAmount=0）
 */

import {
  FormTypeDefinition,
  FormSchema,
  WorkflowDef,
} from '../oa.types';
import { OA_ROLE } from '../oa-role-codes';
import {
  handleBadDebtAutoNode,
  handleBadDebtRejected,
} from '../bad-debt-callback';

// =====================================================
// formSchema
// =====================================================

const badDebtFormSchema: FormSchema = {
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
      placeholder: '请选择客户',
    },

    {
      key: 'billDetails',
      label: '应收单据',
      type: 'table',
      required: true,
      multiple: true,
      searchApi: 'erp_settlement_orders',
      cascadeParams: { consumerId: 'customerId' },
      valueKey: 'bizId',
      labelKey: 'bizOrderStr',
      amountKey: 'leftAmount',
      defaultQueryParams: {
        writeOffQueryStates: 'INIT,PART',
        consumerCollectTypes: 'NORMAL',
        queryDebt: false,
      },
      paginated: true,
      statField: [
        { componentId: 'leftAmount', label: '坏账金额合计' },
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
    },

    {
      key: 'badDebtReason',
      label: '坏账原因',
      type: 'textarea',
      required: true,
      placeholder: '请详细说明坏账原因',
      maxLength: 1000,
    },

    {
      key: 'attachments',
      label: '附件',
      type: 'upload',
      required: false,
      maxCount: 10,
    },

    // ═══ Auto节点回填：ERP单据号 ═══
    {
      key: 'expenditureBillNo',
      label: '坏账费用单号',
      type: 'text',
      required: false,
      disabled: true,
      placeholder: '审批通过后自动生成',
    },
    {
      key: 'receiptBillNo',
      label: '收款单号',
      type: 'text',
      required: false,
      disabled: true,
      placeholder: '审批通过后自动生成',
    },
  ],
};

// =====================================================
// workflowDef
// =====================================================

const badDebtWorkflowDef: WorkflowDef = {
  nodes: [
    {
      order: 1,
      name: '总经理审批',
      type: 'approval',
      handler: { roleCode: OA_ROLE.GM },
      signMode: 'or',
    },
    {
      order: 2,
      name: '创建坏账费用单',
      type: 'auto',
    },
    {
      order: 3,
      name: '创建收款单核销',
      type: 'auto',
    },
  ],
};

// =====================================================
// beforeSubmit: 后端校验
// =====================================================

async function beforeSubmitBadDebt(
  formData: Record<string, unknown>,
  _userId: number
): Promise<Record<string, unknown>> {
  const customerId = formData.customerId;
  if (!customerId) throw new Error('请选择客户');

  const billDetails = formData.billDetails as Array<Record<string, unknown>> | undefined;
  if (!billDetails?.length) throw new Error('请选择应收单据');

  const reason = formData.badDebtReason as string;
  if (!reason?.trim()) throw new Error('请填写坏账原因');

  return {};
}

// =====================================================
// 表单类型定义
// =====================================================

export const badDebtWriteOffFormType: FormTypeDefinition = {
  code: 'bad_debt_write_off',
  name: '坏账处理',
  icon: 'DeleteOutlined',
  category: 'finance',
  sortOrder: 110,
  description: '坏账核销处理：选择客户和应收单据，创建坏账费用单并通过收款单完成核销',
  version: 1,

  formSchema: badDebtFormSchema,
  workflowDef: badDebtWorkflowDef,

  allowedRoles: [OA_ROLE.MARKETER, OA_ROLE.ACCOUNTANT, OA_ROLE.CASHIER],

  beforeSubmit: beforeSubmitBadDebt,
  onApproved: handleBadDebtAutoNode,
  onRejected: handleBadDebtRejected,

  nodeBackfills: [
    {
      nodeOrder: 2,
      description: '坏账费用单创建后回填单号',
      erpMetaFields: ['expenditureBillId', 'expenditureBillStr'],
      formDataFields: ['_expenditureBillId', '_expenditureBillStr', 'expenditureBillNo'],
    },
    {
      nodeOrder: 3,
      description: '收款单创建后回填单号',
      erpMetaFields: ['receiptBillId', 'receiptBillStr'],
      formDataFields: ['_receiptBillId', '_receiptBillStr', 'receiptBillNo'],
    },
  ],

  /** 通用查重配置：同客户不允许重复提交进行中的坏账处理 */
  duplicateCheck: {
    matchFields: ['customerId'],
    includeStatuses: ['processing', 'approved'],
    displayFields: ['title'],
    subjectLabel: '该客户',
  },

  fieldPermissions: {
    nodes: {
      // 节点 0: 发起人（全可编辑）
      "0": {
        "customerId": "editable",
        "billDetails": "editable",
        "badDebtReason": "editable",
        "attachments": "editable",
        "expenditureBillNo": "hidden",
        "receiptBillNo": "hidden",
      },
      // 节点 1: 总经理审批（全只读）
      "1": {
        "customerId": "readonly",
        "billDetails": "readonly",
        "badDebtReason": "readonly",
        "attachments": "readonly",
        "expenditureBillNo": "hidden",
        "receiptBillNo": "hidden",
      },
      // 节点 2/3: auto 节点
      "2": {
        "customerId": "readonly",
        "billDetails": "readonly",
        "badDebtReason": "readonly",
        "attachments": "readonly",
        "expenditureBillNo": "readonly",
        "receiptBillNo": "hidden",
      },
      "3": {
        "customerId": "readonly",
        "billDetails": "readonly",
        "badDebtReason": "readonly",
        "attachments": "readonly",
        "expenditureBillNo": "readonly",
        "receiptBillNo": "readonly",
      },
    },
  },
};

export default badDebtWriteOffFormType;
