/**
 * 客户授信申请 - 表单类型定义
 * @module services/oa-approval/form-types/customer-credit
 */

import { FormTypeDefinition } from '../oa-approval.types';
import { beforeSubmitCustomerCredit, getCustomerCreditCCRoles, onApprovedCustomerCredit, resolveCustomerCreditPreviewContext } from '../customer-credit-callback';

/**
 * 客户授信申请表单类型定义
 * 支持三种授信类型：账期、滚单、压单
 * 审批流：营销经理 → 往来会计 → 自动更新ERP客户授信
 * 抄送：总经理
 */
export const customerCreditFormType: FormTypeDefinition = {
  code: 'customer_credit',
  name: '客户授信申请',
  icon: 'SafetyCertificateOutlined',
  category: 'finance',
  sortOrder: 110,
  description: '申请客户授信，包括账期、滚单、压单',
  version: 5,

  formSchema: {
    fields: [
      // 客户选择（ERP参考数据）
      {
        key: 'customer',
        label: '客户',
        type: 'erp_customer',
        required: true,
        searchApi: 'erp_customers',
        nameField: 'customerName',
        autoFill: {
          contactName: 'contactName',
          contactTel: 'contactTel',
          customerName: 'name',
        },
      },
      // 联系人（自动填充，只读）
      {
        key: 'contactName',
        label: '联系人',
        type: 'text',
        required: false,
        disabled: true,
      },
      // 联系电话（自动填充，只读）
      {
        key: 'contactTel',
        label: '联系电话',
        type: 'text',
        required: false,
        disabled: true,
      },
      // 授信类型
      {
        key: 'creditType',
        label: '授信类型',
        type: 'select',
        required: true,
        options: [
          { value: 'payment_period', label: '账期' },
          { value: 'rolling_order', label: '滚单' },
          { value: 'hold_order', label: '压单' },
        ],
      },
      // === 账期字段 ===
      {
        key: 'maxOverdueDays',
        label: '最大欠款天数',
        type: 'number',
        required: true,
        min: 1,
        suffix: '天',
        visibleWhen: { field: 'creditType', operator: '==', value: 'payment_period' },
        requiredWhen: { field: 'creditType', operator: '==', value: 'payment_period' },
      },
      // === 滚单字段 ===
      {
        key: 'rollingMaxOverdueDays',
        label: '最大欠款天数',
        type: 'number',
        required: true,
        min: 1,
        suffix: '天',
        visibleWhen: { field: 'creditType', operator: '==', value: 'rolling_order' },
        requiredWhen: { field: 'creditType', operator: '==', value: 'rolling_order' },
      },
      {
        key: 'rollingMaxOverdueOrders',
        label: '最大欠款单数',
        type: 'number',
        required: true,
        min: 1,
        suffix: '单',
        visibleWhen: { field: 'creditType', operator: '==', value: 'rolling_order' },
        requiredWhen: { field: 'creditType', operator: '==', value: 'rolling_order' },
      },
      // === 压单字段 ===
      {
        key: 'holdSettlementOrders',
        label: '选择压单结算单',
        type: 'erp_settlement_order',
        required: true,
        searchApi: 'erp_settlement_orders',
        multiple: true,
        cascadeFrom: 'customer',
        nameField: 'holdSettlementOrderNames',
        visibleWhen: { field: 'creditType', operator: '==', value: 'hold_order' },
        requiredWhen: { field: 'creditType', operator: '==', value: 'hold_order' },
      },
      // 压单类型
      {
        key: 'hoardType',
        label: '压单类型',
        type: 'select',
        required: false,
        defaultValue: 'long_term',
        options: [
          { value: 'long_term', label: '长期压单' },
          { value: 'time_limited', label: '期限压单' },
        ],
        visibleWhen: { field: 'creditType', operator: '==', value: 'hold_order' },
        requiredWhen: { field: 'creditType', operator: '==', value: 'hold_order' },
      },
      // 压单天数（仅期限压单需要）
      {
        key: 'holdDays',
        label: '压单天数',
        type: 'number',
        required: false,
        min: 1,
        suffix: '天',
        visibleWhen: { field: 'hoardType', operator: '==', value: 'time_limited' },
        requiredWhen: { field: 'hoardType', operator: '==', value: 'time_limited' },
      },
      // 营业执照照片（客户已有执照时非必填）
      {
        key: 'businessLicensePhotos',
        label: '客户营业执照',
        type: 'photo',
        required: false,
        requiredWhen: { field: '_hasExistingLicense', operator: '==', value: 'no' },
        maxCount: 3,
      },
      // 备注
      {
        key: 'remark',
        label: '备注',
        type: 'textarea',
        required: false,
        maxLength: 500,
      },
      // 以下为隐藏字段，存储 ERP 显示名称（下划线开头不在详情页展示）
      {
        key: '_customerName',
        label: '客户名称',
        type: 'text',
        required: false,
      },
      {
        key: '_holdSettlementOrderNames',
        label: '压单结算单名称',
        type: 'text',
        required: false,
      },
    ],
  },

  workflowDef: {
    nodes: [
      // 节点1：营销经理审批
      {
        order: 1,
        name: '营销经理审批',
        type: 'role',
        roleCode: 'marketing_manager',
      },
      // 节点2：往来会计审批
      {
        order: 2,
        name: '往来会计审批',
        type: 'role',
        roleCode: 'current_accountant',
      },
      // 节点3：自动更新ERP客户授信
      {
        order: 3,
        name: '更新ERP客户授信',
        type: 'auto',
      },
    ],
  },

  // beforeSubmit: 校验提交者角色、检测营业执照状态、补全客户名称
  beforeSubmit: beforeSubmitCustomerCredit,

  // getCCRoles: 固定抄送总经理
  getCCRoles: getCustomerCreditCCRoles,

  // resolvePreviewContext: 流程预览上下文（当前无需注入额外字段）
  resolvePreviewContext: resolveCustomerCreditPreviewContext,

  // onApproved: 审批通过后调用 ERP API 更新授信信息
  onApproved: onApprovedCustomerCredit,
};
