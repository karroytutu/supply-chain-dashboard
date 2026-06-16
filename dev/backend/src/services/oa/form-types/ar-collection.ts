/**
 * 逾期催收 - 表单类型定义
 * @module services/oa/form-types/ar-collection
 *
 * 用 OA 流程引擎直接替代旧催收模块：
 * - 逾期后定时任务直接创建 OA 实例（无过渡期）
 * - 处理人通过填写表单完成催收操作
 * - 升级/退回通过动态插入节点在同一实例内流转
 *
 * 节点交互类型: operation（操作型）
 * 按钮布局: [完成] [更新] [更多▼: 退回/转交]
 */

import {
  FormTypeDefinition,
  FormField,
  FieldPermission,
  NodeInteractionType,
  ConditionDef,
} from '../oa.types';
import {
  beforeSubmitArCollection,
  onApprovedArCollection,
} from '../ar-collection-callback';

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
  1: 'marketing_manager',
  2: 'current_accountant',
};

// =====================================================
// 字段权限预设（按层级）
// =====================================================

/** 只读展示字段（所有层级相同） */
const READONLY_FIELDS: Record<string, FieldPermission> = {
  consumerName: 'readonly',
  totalAmount: 'readonly',
  billCount: 'readonly',
  maxOverdueDays: 'readonly',
  managerName: 'readonly',
  maxDebtDays: 'readonly',
  maxDebtOrderNum: 'readonly',
  billDetails: 'readonly',
};

/** 可编辑操作字段（所有层级相同，通过 visibleWhen 控制显示） */
const EDITABLE_FIELDS: Record<string, FieldPermission> = {
  action: 'editable',
  verifyRemark: 'editable',
  extensionDays: 'editable',
  extensionReason: 'editable',
  guarantorSignature: 'editable',
  differenceRemark: 'editable',
  escalateReason: 'editable',
  resolveDiffRemark: 'editable',
  letterAttachment: 'editable',
  deliveryProof: 'editable',
};

function buildFieldPermissions(_level: number): Record<string, FieldPermission> {
  return { ...READONLY_FIELDS, ...EDITABLE_FIELDS };
}

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
      ],
    },
    // === 隐藏字段 ===
    { key: '_extensionCount', label: '延期次数', type: 'number' as const, required: false },
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
      requiredWhen: { field: 'action', operator: '==' as const, value: 'extension' },
    },
    {
      key: 'extensionReason',
      label: '延期原因',
      type: 'textarea' as const,
      required: true,
      maxLength: 500,
      visibleWhen: { field: 'action', operator: '==' as const, value: 'extension' },
      requiredWhen: { field: 'action', operator: '==' as const, value: 'extension' },
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
      requiredWhen: { field: 'action', operator: '==' as const, value: 'difference' },
    },
    {
      key: 'escalateReason',
      label: '升级原因',
      type: 'textarea' as const,
      required: true,
      maxLength: 500,
      visibleWhen: { field: 'action', operator: '==' as const, value: 'escalate' },
      requiredWhen: { field: 'action', operator: '==' as const, value: 'escalate' },
    },
    {
      key: 'resolveDiffRemark',
      label: '差异解决说明',
      type: 'textarea' as const,
      required: true,
      maxLength: 1000,
      visibleWhen: { field: 'action', operator: '==' as const, value: 'resolve_diff' },
      requiredWhen: { field: 'action', operator: '==' as const, value: 'resolve_diff' },
    },
    {
      key: 'letterAttachment',
      label: '函件附件',
      type: 'upload' as const,
      required: true,
      maxCount: 10,
      visibleWhen: { field: 'action', operator: '==' as const, value: 'send_letter' },
      requiredWhen: { field: 'action', operator: '==' as const, value: 'send_letter' },
    },
    {
      key: 'deliveryProof',
      label: '送达凭证',
      type: 'upload' as const,
      required: true,
      maxCount: 10,
      visibleWhen: { field: 'action', operator: '==' as const, value: 'send_letter' },
      requiredWhen: { field: 'action', operator: '==' as const, value: 'send_letter' },
    },
  ],
};

// =====================================================
// workflowDef
// =====================================================

const arCollectionWorkflowDef = {
  nodes: [
    {
      order: 1,
      name: '营销师催收',
      type: 'approval' as const,
      handler: { roleCode: 'marketer' },
      signMode: 'or' as const,
      interactionType: 'operation' as NodeInteractionType,
      fieldPermissions: buildFieldPermissions(0),
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
          exemptNodeNames: ['起诉立案', '庭审进展', '判决结果', '执行进展', '更新催收状态'],
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
      name: '更新催收状态',
      type: 'auto' as const,
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
  version: 2,

  formSchema: arCollectionFormSchema,
  workflowDef: arCollectionWorkflowDef,

  /** 提交前：填充只读展示字段（从 ERP 查询催收任务和明细数据） */
  beforeSubmit: beforeSubmitArCollection,

  /** 自动节点执行：根据 action 字段决定流转逻辑 */
  onApproved: onApprovedArCollection,
};
