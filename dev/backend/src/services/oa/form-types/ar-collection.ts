/**
 * 逾期催收 - 表单类型定义
 * @module services/oa/form-types/ar-collection
 *
 * 用 OA 流程引擎直接替代旧催收模块：
 * - 逾期后定时任务直接创建 OA 实例（无过渡期）
 * - 处理人通过填写表单完成催收操作
 * - 升级/退回通过条件重评估机制在同一实例内流转
 * - auto 环节自动执行核销校验，全部还款则结案，未还清则退回营销师
 *
 * 按钮布局: [完成] [更新] [更多▼: 退回/转交]
 */

import {
  FormTypeDefinition,
  FormField,
  FieldPermission,
  ConditionDef,
} from '../oa.types';
import {
  beforeSubmitArCollection,
  handleArCollectionAutoVerify,
} from '../ar-collection-callback';
import { OA_ROLE } from '../oa-role-codes';

// =====================================================
// 常量
// =====================================================

/** 催收操作选项 */
export const COLLECTION_ACTIONS = {
  VERIFY: 'verify',
  EXTENSION: 'extension',
  DIFFERENCE: 'difference',
  ESCALATE: 'escalate',
  RESOLVE_DIFF: 'resolve_diff',
  SEND_LETTER: 'send_letter',
  LAWSUIT: 'lawsuit',
} as const;

/** 各层级可选操作 */
export const LEVEL_ACTION_OPTIONS: Record<number, string[]> = {
  0: ['verify', 'extension', 'difference', 'escalate'],
  1: ['verify', 'extension', 'difference', 'escalate'],
  2: ['verify', 'extension', 'resolve_diff', 'send_letter', 'lawsuit'],
};

/** 升级角色映射 */
export const ESCALATION_ROLES: Record<number, string> = {
  1: OA_ROLE.MARKETING_MGR,
  2: OA_ROLE.ACCOUNTANT,
};

// =====================================================
// formSchema
// =====================================================

const arCollectionFormSchema: { fields: FormField[] } = {
  fields: [
    // === 只读展示区 ===
    { key: 'consumerName', label: '客户名称', type: 'text' as const, required: false, disabled: true },
    { key: 'totalAmount', label: '欠款总额', type: 'money' as const, required: false, disabled: true, upper: true },
    { key: 'billCount', label: '账单数', type: 'number' as const, required: false, disabled: true },
    { key: 'maxOverdueDays', label: '最大逾期天数', type: 'number' as const, required: false, disabled: true, suffix: '天' },
    { key: 'managerName', label: '责任人', type: 'text' as const, required: false, disabled: true },
    { key: 'maxDebtDays', label: '最大欠款天数', type: 'number' as const, required: false, disabled: true, suffix: '天' },
    { key: 'maxDebtOrderNum', label: '最大欠款单数', type: 'number' as const, required: false, disabled: true },
    {
      key: 'billDetails',
      label: '账单明细',
      type: 'table' as const,
      required: false,
      disabled: true,
      children: [
        // billNo（内部编号）不展示，但数据保留在 formData 中用于核销校验
        { key: 'orderNo', label: '订单编号', type: 'text' as const, required: false },
        { key: 'workTime', label: '业务日期', type: 'date' as const, required: false },
        { key: 'billType', label: '单据类型', type: 'text' as const, required: false },
        { key: 'totalAmount', label: '单据金额', type: 'money' as const, required: false },
        { key: 'writeOffAmount', label: '已结金额', type: 'money' as const, required: false },
        { key: 'leftAmount', label: '剩余未收', type: 'money' as const, required: false },
        { key: 'overdueDays', label: '逾期天数', type: 'number' as const, required: false, suffix: '天' },
        { key: 'billNote', label: '单据备注', type: 'text' as const, required: false },
        { key: 'verifyStatus', label: '核销情况', type: 'text' as const, required: false },
      ],
    },
    // === 操作区（通过 visibleWhen 条件显示） ===
    {
      key: 'action',
      label: '催收操作',
      type: 'select' as const,
      required: true,
      options: [
        { value: 'verify', label: '核销标记' },
        { value: 'extension', label: '申请延期' },
        { value: 'difference', label: '存在差异' },
        { value: 'escalate', label: '升级处理' },
        { value: 'resolve_diff', label: '差异解决' },
        { value: 'send_letter', label: '发函' },
        { value: 'lawsuit', label: '起诉' },
      ],
    },
    {
      key: 'verifyRemark',
      label: '核销备注',
      type: 'text' as const,
      required: false,
      visibleWhen: { field: 'action', operator: '==' as const, value: 'verify' },
    },
    {
      key: 'extensionDays',
      label: '延期天数',
      type: 'number' as const,
      required: true,
      min: 1,
      max: 30,
      suffix: '天',
      visibleWhen: { field: 'action', operator: '==' as const, value: 'extension' },
    },
    {
      key: 'extensionReason',
      label: '延期原因',
      type: 'textarea' as const,
      required: true,
      maxLength: 500,
      visibleWhen: { field: 'action', operator: '==' as const, value: 'extension' },
    },
    {
      key: 'guarantorSignature',
      label: '营销担保签字',
      type: 'signature' as const,
      required: true,
      visibleWhen: { field: 'action', operator: '==' as const, value: 'extension' },
    },
    {
      key: 'differenceRemark',
      label: '差异说明',
      type: 'textarea' as const,
      required: true,
      maxLength: 1000,
      visibleWhen: { field: 'action', operator: '==' as const, value: 'difference' },
    },
    {
      key: 'escalateReason',
      label: '升级原因',
      type: 'textarea' as const,
      required: true,
      maxLength: 500,
      visibleWhen: { field: 'action', operator: '==' as const, value: 'escalate' },
    },
    {
      key: 'resolveDiffRemark',
      label: '差异解决说明',
      type: 'textarea' as const,
      required: true,
      maxLength: 1000,
      visibleWhen: { field: 'action', operator: '==' as const, value: 'resolve_diff' },
    },
    {
      key: 'letterAttachment',
      label: '函件附件',
      type: 'upload' as const,
      required: true,
      maxCount: 10,
      visibleWhen: { field: 'action', operator: '==' as const, value: 'send_letter' },
    },
    {
      key: 'deliveryProof',
      label: '送达凭证',
      type: 'upload' as const,
      required: true,
      maxCount: 10,
      visibleWhen: { field: 'action', operator: '==' as const, value: 'send_letter' },
    },
    // === 营销经理(marketing_manager)操作区 ===
    {
      key: 'mgrAction',
      label: '催收操作(经理)',
      type: 'select' as const,
      required: true,
      options: [
        { value: 'verify', label: '核销标记' },
        { value: 'extension', label: '申请延期' },
        { value: 'difference', label: '存在差异' },
        { value: 'escalate', label: '升级处理' },
      ],
    },
    {
      key: 'mgrVerifyRemark',
      label: '核销备注(经理)',
      type: 'text' as const,
      required: false,
      visibleWhen: { field: 'mgrAction', operator: '==' as const, value: 'verify' },
    },
    {
      key: 'mgrExtensionDays',
      label: '延期天数(经理)',
      type: 'number' as const,
      required: true,
      min: 1,
      max: 30,
      suffix: '天',
      visibleWhen: { field: 'mgrAction', operator: '==' as const, value: 'extension' },
    },
    {
      key: 'mgrExtensionReason',
      label: '延期原因(经理)',
      type: 'textarea' as const,
      required: true,
      maxLength: 500,
      visibleWhen: { field: 'mgrAction', operator: '==' as const, value: 'extension' },
    },
    {
      key: 'mgrGuarantorSignature',
      label: '营销担保签字(经理)',
      type: 'signature' as const,
      required: true,
      visibleWhen: { field: 'mgrAction', operator: '==' as const, value: 'extension' },
    },
    {
      key: 'mgrDifferenceRemark',
      label: '差异说明(经理)',
      type: 'textarea' as const,
      required: true,
      maxLength: 1000,
      visibleWhen: { field: 'mgrAction', operator: '==' as const, value: 'difference' },
    },
    {
      key: 'mgrEscalateReason',
      label: '升级原因(经理)',
      type: 'textarea' as const,
      required: true,
      maxLength: 500,
      visibleWhen: { field: 'mgrAction', operator: '==' as const, value: 'escalate' },
    },
    // === 往来会计(current_accountant)操作区 ===
    {
      key: 'accAction',
      label: '催收操作(会计)',
      type: 'select' as const,
      required: true,
      options: [
        { value: 'verify', label: '核销标记' },
        { value: 'extension', label: '申请延期' },
        { value: 'resolve_diff', label: '差异解决' },
        { value: 'send_letter', label: '发函' },
        { value: 'lawsuit', label: '起诉' },
      ],
    },
    {
      key: 'accVerifyRemark',
      label: '核销备注(会计)',
      type: 'text' as const,
      required: false,
      visibleWhen: { field: 'accAction', operator: '==' as const, value: 'verify' },
    },
    {
      key: 'accExtensionDays',
      label: '延期天数(会计)',
      type: 'number' as const,
      required: true,
      min: 1,
      max: 30,
      suffix: '天',
      visibleWhen: { field: 'accAction', operator: '==' as const, value: 'extension' },
    },
    {
      key: 'accExtensionReason',
      label: '延期原因(会计)',
      type: 'textarea' as const,
      required: true,
      maxLength: 500,
      visibleWhen: { field: 'accAction', operator: '==' as const, value: 'extension' },
    },
    {
      key: 'accResolveDiffRemark',
      label: '差异解决说明(会计)',
      type: 'textarea' as const,
      required: true,
      maxLength: 1000,
      visibleWhen: { field: 'accAction', operator: '==' as const, value: 'resolve_diff' },
    },
    {
      key: 'accLetterAttachment',
      label: '函件附件(会计)',
      type: 'upload' as const,
      required: true,
      maxCount: 10,
      visibleWhen: { field: 'accAction', operator: '==' as const, value: 'send_letter' },
    },
    {
      key: 'accDeliveryProof',
      label: '送达凭证(会计)',
      type: 'upload' as const,
      required: true,
      maxCount: 10,
      visibleWhen: { field: 'accAction', operator: '==' as const, value: 'send_letter' },
    },
  ],
};

// =====================================================
// workflowDef
// =====================================================

const arCollectionWorkflowDef: { nodes: import('../oa.types').WorkflowNodeDef[] } = {
  nodes: [
    {
      order: 1,
      name: '营销师催收',
      type: 'handle' as const,
      handler: { roleCode: OA_ROLE.MARKETER },
      signMode: 'or' as const,
      
      fieldOptionFilter: { action: LEVEL_ACTION_OPTIONS[0] },
      timeout: {
        durationMinutes: 3 * 24 * 60, // 3天
        reminder: {
          firstReminderDelayMinutes: 0,
          intervalMinutes: 8 * 60, // 每8小时
          maxReminders: 10,
          ccSupervisorAfterCount: 2,
        },
        assessment: {
          exemptNodeNames: ['起诉立案', '庭审进展', '判决结果', '执行进展', '核销校验'],
          tiers: [
            { name: '一级考核(3-5天)', minOverdueDays: 3, maxOverdueDays: 5, penaltyAmount: 10 },
            { name: '二级考核(5-7天)', minOverdueDays: 5, maxOverdueDays: 7, penaltyAmount: 20 },
            { name: '三级考核(7天+)', minOverdueDays: 7, maxOverdueDays: null, penaltyAmount: 50 },
          ],
        },
      },
    },
    {
      order: 2,
      name: '营销经理催收',
      type: 'handle' as const,
      handler: { roleCode: OA_ROLE.MARKETING_MGR },
      signMode: 'or' as const,
      condition: { field: 'action', operator: '==' as const, value: 'escalate' },
      
      fieldOptionFilter: { mgrAction: LEVEL_ACTION_OPTIONS[1] },
    },
    {
      order: 3,
      name: '往来会计催收',
      type: 'handle' as const,
      handler: { roleCode: OA_ROLE.ACCOUNTANT },
      signMode: 'or' as const,
      condition: { field: 'mgrAction', operator: '==' as const, value: 'escalate' },
      
      fieldOptionFilter: { accAction: LEVEL_ACTION_OPTIONS[2] },
    },
    {
      order: 4,
      name: '财务差异处理',
      type: 'handle' as const,
      handler: { roleCode: OA_ROLE.ACCOUNTANT },
      signMode: 'or' as const,
      condition: {
        match: 'any' as const,
        conditions: [
          { field: 'action', operator: '==' as const, value: 'difference' },
          { field: 'accAction', operator: '==' as const, value: 'difference' },
        ],
      },
      
      fieldOptionFilter: { accAction: ['resolve_diff'] },
    },
    {
      order: 5,
      name: '起诉立案',
      type: 'handle' as const,
      handler: { roleCode: OA_ROLE.ACCOUNTANT },
      signMode: 'or' as const,
      condition: { field: 'accAction', operator: '==' as const, value: 'lawsuit' },
      
      fieldOptionFilter: { accAction: ['verify', 'send_letter'] },
    },
    {
      order: 6,
      name: '总经理审批延期',
      type: 'approval' as const,
      handler: { roleCode: OA_ROLE.GM },
      signMode: 'or' as const,
      condition: {
        match: 'any' as const,
        conditions: [
          { field: 'mgrAction', operator: '==' as const, value: 'extension' },
          { field: 'accAction', operator: '==' as const, value: 'extension' },
        ],
      },
    },
    {
      order: 7,
      name: '核销校验',
      type: 'auto' as const,
      condition: { field: 'action', operator: '==' as const, value: 'verify' },
    },
  ],
};

// =====================================================
// 表单类型定义
// =====================================================

export const arCollectionFormType: FormTypeDefinition = {
  code: 'ar_collection',
  name: '逾期催收',
  icon: 'AlertOutlined',
  category: 'supply_chain',
  sortOrder: 60,
  description: '逾期应收账款催收处理流程，支持核销、延期、差异、升级、发函、起诉等操作',
  version: 4,

  formSchema: arCollectionFormSchema,
  workflowDef: arCollectionWorkflowDef,

  /** 提交前：填充只读展示字段（从 ERP 查询催收任务和明细数据） */
  beforeSubmit: beforeSubmitArCollection,

  /** auto 环节回调：核销校验 + 即时退回循环催收 */
  onApproved: handleArCollectionAutoVerify,
  fieldPermissions: {
    nodes: {
      "0": { "action": "editable", "accAction": "hidden", "billCount": "editable", "mgrAction": "hidden", "billDetails": "editable", "managerName": "editable", "maxDebtDays": "editable", "totalAmount": "editable", "consumerName": "editable", "verifyRemark": "editable", "deliveryProof": "editable", "extensionDays": "editable", "escalateReason": "editable", "maxOverdueDays": "editable", "accVerifyRemark": "hidden", "extensionReason": "editable", "maxDebtOrderNum": "editable", "mgrVerifyRemark": "hidden", "accDeliveryProof": "hidden", "accExtensionDays": "hidden", "differenceRemark": "editable", "letterAttachment": "editable", "mgrExtensionDays": "hidden", "mgrEscalateReason": "hidden", "resolveDiffRemark": "editable", "accExtensionReason": "hidden", "guarantorSignature": "editable", "mgrExtensionReason": "hidden", "accLetterAttachment": "hidden", "billDetails.orderNo": "editable", "mgrDifferenceRemark": "hidden", "accResolveDiffRemark": "hidden", "billDetails.billNote": "editable", "billDetails.billType": "editable", "billDetails.workTime": "editable", "mgrGuarantorSignature": "hidden", "billDetails.leftAmount": "editable", "billDetails.overdueDays": "editable", "billDetails.totalAmount": "editable", "billDetails.verifyStatus": "editable", "billDetails.writeOffAmount": "editable" },
      "1": { "action": "editable", "accAction": "hidden", "billCount": "readonly", "mgrAction": "hidden", "billDetails": "readonly", "managerName": "readonly", "maxDebtDays": "readonly", "totalAmount": "readonly", "consumerName": "readonly", "verifyRemark": "editable", "deliveryProof": "editable", "extensionDays": "editable", "escalateReason": "editable", "maxOverdueDays": "readonly", "accVerifyRemark": "hidden", "extensionReason": "editable", "maxDebtOrderNum": "readonly", "mgrVerifyRemark": "hidden", "accDeliveryProof": "hidden", "accExtensionDays": "hidden", "differenceRemark": "editable", "letterAttachment": "editable", "mgrExtensionDays": "hidden", "mgrEscalateReason": "hidden", "resolveDiffRemark": "editable", "accExtensionReason": "hidden", "guarantorSignature": "editable", "mgrExtensionReason": "hidden", "accLetterAttachment": "hidden", "billDetails.orderNo": "readonly", "mgrDifferenceRemark": "hidden", "accResolveDiffRemark": "hidden", "billDetails.billNote": "readonly", "billDetails.billType": "readonly", "billDetails.workTime": "readonly", "mgrGuarantorSignature": "hidden", "billDetails.leftAmount": "readonly", "billDetails.overdueDays": "readonly", "billDetails.totalAmount": "readonly", "billDetails.verifyStatus": "readonly", "billDetails.writeOffAmount": "readonly" },
      "2": { "action": "readonly", "accAction": "hidden", "billCount": "readonly", "mgrAction": "editable", "billDetails": "readonly", "managerName": "readonly", "maxDebtDays": "readonly", "totalAmount": "readonly", "consumerName": "readonly", "verifyRemark": "readonly", "deliveryProof": "readonly", "extensionDays": "readonly", "escalateReason": "readonly", "maxOverdueDays": "readonly", "accVerifyRemark": "hidden", "extensionReason": "readonly", "maxDebtOrderNum": "readonly", "mgrVerifyRemark": "editable", "accDeliveryProof": "hidden", "accExtensionDays": "hidden", "differenceRemark": "readonly", "letterAttachment": "readonly", "mgrExtensionDays": "editable", "mgrEscalateReason": "editable", "resolveDiffRemark": "readonly", "accExtensionReason": "hidden", "guarantorSignature": "readonly", "mgrExtensionReason": "editable", "accLetterAttachment": "hidden", "billDetails.orderNo": "readonly", "mgrDifferenceRemark": "editable", "accResolveDiffRemark": "hidden", "billDetails.billNote": "readonly", "billDetails.billType": "readonly", "billDetails.workTime": "readonly", "mgrGuarantorSignature": "editable", "billDetails.leftAmount": "readonly", "billDetails.overdueDays": "readonly", "billDetails.totalAmount": "readonly", "billDetails.verifyStatus": "readonly", "billDetails.writeOffAmount": "readonly" },
      "3": { "action": "readonly", "accAction": "editable", "billCount": "readonly", "mgrAction": "readonly", "billDetails": "readonly", "managerName": "readonly", "maxDebtDays": "readonly", "totalAmount": "readonly", "consumerName": "readonly", "verifyRemark": "readonly", "deliveryProof": "readonly", "extensionDays": "readonly", "escalateReason": "readonly", "maxOverdueDays": "readonly", "accVerifyRemark": "editable", "extensionReason": "readonly", "maxDebtOrderNum": "readonly", "mgrVerifyRemark": "readonly", "accDeliveryProof": "editable", "accExtensionDays": "editable", "differenceRemark": "readonly", "letterAttachment": "readonly", "mgrExtensionDays": "readonly", "mgrEscalateReason": "readonly", "resolveDiffRemark": "readonly", "accExtensionReason": "editable", "guarantorSignature": "readonly", "mgrExtensionReason": "readonly", "accLetterAttachment": "editable", "billDetails.orderNo": "readonly", "mgrDifferenceRemark": "readonly", "accResolveDiffRemark": "editable", "billDetails.billNote": "readonly", "billDetails.billType": "readonly", "billDetails.workTime": "readonly", "mgrGuarantorSignature": "readonly", "billDetails.leftAmount": "readonly", "billDetails.overdueDays": "readonly", "billDetails.totalAmount": "readonly", "billDetails.verifyStatus": "readonly", "billDetails.writeOffAmount": "readonly" },
      "4": { "action": "readonly", "accAction": "editable", "billCount": "readonly", "mgrAction": "readonly", "billDetails": "readonly", "managerName": "readonly", "maxDebtDays": "readonly", "totalAmount": "readonly", "consumerName": "readonly", "verifyRemark": "readonly", "deliveryProof": "readonly", "extensionDays": "readonly", "escalateReason": "readonly", "maxOverdueDays": "readonly", "accVerifyRemark": "editable", "extensionReason": "readonly", "maxDebtOrderNum": "readonly", "mgrVerifyRemark": "readonly", "accDeliveryProof": "editable", "accExtensionDays": "editable", "differenceRemark": "readonly", "letterAttachment": "readonly", "mgrExtensionDays": "readonly", "mgrEscalateReason": "readonly", "resolveDiffRemark": "readonly", "accExtensionReason": "editable", "guarantorSignature": "readonly", "mgrExtensionReason": "readonly", "accLetterAttachment": "editable", "billDetails.orderNo": "readonly", "mgrDifferenceRemark": "readonly", "accResolveDiffRemark": "editable", "billDetails.billNote": "readonly", "billDetails.billType": "readonly", "billDetails.workTime": "readonly", "mgrGuarantorSignature": "readonly", "billDetails.leftAmount": "readonly", "billDetails.overdueDays": "readonly", "billDetails.totalAmount": "readonly", "billDetails.verifyStatus": "readonly", "billDetails.writeOffAmount": "readonly" },
      "5": { "action": "readonly", "accAction": "editable", "billCount": "readonly", "mgrAction": "readonly", "billDetails": "readonly", "managerName": "readonly", "maxDebtDays": "readonly", "totalAmount": "readonly", "consumerName": "readonly", "verifyRemark": "readonly", "deliveryProof": "readonly", "extensionDays": "readonly", "escalateReason": "readonly", "maxOverdueDays": "readonly", "accVerifyRemark": "editable", "extensionReason": "readonly", "maxDebtOrderNum": "readonly", "mgrVerifyRemark": "readonly", "accDeliveryProof": "editable", "accExtensionDays": "editable", "differenceRemark": "readonly", "letterAttachment": "readonly", "mgrExtensionDays": "readonly", "mgrEscalateReason": "readonly", "resolveDiffRemark": "readonly", "accExtensionReason": "editable", "guarantorSignature": "readonly", "mgrExtensionReason": "readonly", "accLetterAttachment": "editable", "billDetails.orderNo": "readonly", "mgrDifferenceRemark": "readonly", "accResolveDiffRemark": "editable", "billDetails.billNote": "readonly", "billDetails.billType": "readonly", "billDetails.workTime": "readonly", "mgrGuarantorSignature": "readonly", "billDetails.leftAmount": "readonly", "billDetails.overdueDays": "readonly", "billDetails.totalAmount": "readonly", "billDetails.verifyStatus": "readonly", "billDetails.writeOffAmount": "readonly" },
      "6": { "action": "readonly", "accAction": "editable", "billCount": "readonly", "mgrAction": "readonly", "billDetails": "readonly", "managerName": "readonly", "maxDebtDays": "readonly", "totalAmount": "readonly", "consumerName": "readonly", "verifyRemark": "readonly", "deliveryProof": "readonly", "extensionDays": "readonly", "escalateReason": "readonly", "maxOverdueDays": "readonly", "accVerifyRemark": "editable", "extensionReason": "readonly", "maxDebtOrderNum": "readonly", "mgrVerifyRemark": "readonly", "accDeliveryProof": "editable", "accExtensionDays": "editable", "differenceRemark": "readonly", "letterAttachment": "readonly", "mgrExtensionDays": "readonly", "mgrEscalateReason": "readonly", "resolveDiffRemark": "readonly", "accExtensionReason": "editable", "guarantorSignature": "readonly", "mgrExtensionReason": "readonly", "accLetterAttachment": "editable", "billDetails.orderNo": "readonly", "mgrDifferenceRemark": "readonly", "accResolveDiffRemark": "editable", "billDetails.billNote": "readonly", "billDetails.billType": "readonly", "billDetails.workTime": "readonly", "mgrGuarantorSignature": "readonly", "billDetails.leftAmount": "readonly", "billDetails.overdueDays": "readonly", "billDetails.totalAmount": "readonly", "billDetails.verifyStatus": "readonly", "billDetails.writeOffAmount": "readonly" }
    },
  },
};
