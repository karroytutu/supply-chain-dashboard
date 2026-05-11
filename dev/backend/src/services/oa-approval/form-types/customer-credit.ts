/**
 * 客户授信申请 - 表单类型定义
 * @module services/oa-approval/form-types/customer-credit
 */

import { FormTypeDefinition } from '../oa-approval.types';
import { beforeSubmitCustomerCredit, getCustomerCreditCCRoles, onApprovedCustomerCredit, resolveCustomerCreditPreviewContext } from '../customer-credit-callback';

/**
 * 客户授信申请表单类型定义
 * 支持三种授信类型：账期、滚单、压单
 * 分级审批流：根据最大欠款天数/压单金额确定审批节点
 *   low(≤30天/≤500元): 营销经理 → 完成
 *   medium(30-60天/500-1000元): 营销经理 → 往来会计 → 完成
 *   high(>60天/>1000元): 营销经理 → 往来会计 → 总经理 → 完成
 * 提交人自跳过：marketing_manager 跳过节点1，current_accountant 跳过节点2
 */
export const customerCreditFormType: FormTypeDefinition = {
  code: 'customer_credit',
  name: '客户授信申请',
  icon: 'SafetyCertificateOutlined',
  category: 'finance',
  sortOrder: 110,
  description: '申请客户授信，包括账期、滚单、压单',
  version: 3,

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
      // 节点1：营销经理审批（提交人为 marketing_manager 时跳过）
      {
        order: 1,
        name: '营销经理审批',
        type: 'role',
        roleCode: 'marketing_manager',
        condition: { field: '_needsManagerApproval', operator: '==', value: 'yes' },
      },
      // 节点2：往来会计审批（low级别跳过，提交人为 current_accountant 时跳过）
      {
        order: 2,
        name: '往来会计审批',
        type: 'role',
        roleCode: 'current_accountant',
        condition: { field: '_needsAccountantApproval', operator: '==', value: 'yes' },
      },
      // 节点3：总经理审批（仅 high 级别需要）
      {
        order: 3,
        name: '总经理审批',
        type: 'role',
        roleCode: 'general_manager',
        condition: { field: '_needsGmApproval', operator: '==', value: 'yes' },
      },
      // 节点4：自动更新ERP客户授信
      {
        order: 4,
        name: '更新ERP客户授信',
        type: 'auto',
      },
    ],
  },

  // beforeSubmit: 注入分级审批字段和提交者角色到 formData，供条件节点判断
  beforeSubmit: beforeSubmitCustomerCredit,

  // getCCRoles: 根据审批分级动态解析抄送角色
  getCCRoles: getCustomerCreditCCRoles,

  // resolvePreviewContext: 流程预览时动态注入分级字段，实现条件节点实时过滤
  resolvePreviewContext: resolveCustomerCreditPreviewContext,

  // onApproved: 审批通过后调用 ERP API 更新授信信息
  onApproved: onApprovedCustomerCredit,
};
