/**
 * 客户授信申请 - 表单类型定义
 * @module services/oa-approval/form-types/customer-credit
 */

import { FormTypeDefinition } from '../oa-approval.types';
import { beforeSubmitCustomerCredit, onApprovedCustomerCredit } from '../customer-credit-callback';

/**
 * 客户授信申请表单类型定义
 * 支持三种授信类型：账期、滚单、压单
 * 动态审批流：营销师提交→3节点，营销主管/往来会计提交→1节点
 */
export const customerCreditFormType: FormTypeDefinition = {
  code: 'customer_credit',
  name: '客户授信申请',
  icon: 'SafetyCertificateOutlined',
  category: 'finance',
  sortOrder: 110,
  description: '申请客户授信，包括账期、滚单、压单',
  version: 1,

  formSchema: {
    fields: [
      // 客户选择（ERP参考数据）
      {
        key: 'customer',
        label: '客户',
        type: 'erp_customer',
        required: true,
        searchApi: 'erp_customers',
        autoFill: {
          customerName: 'name',
          customerCode: 'consumerCode',
        },
      },
      // 客户名称（自动填充，只读）
      {
        key: 'customerName',
        label: '客户名称',
        type: 'text',
        required: false,
        disabled: true,
      },
      // 客户编码（自动填充，只读）
      {
        key: 'customerCode',
        label: '客户编码',
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
        visibleWhen: { field: 'creditType', operator: '==', value: 'hold_order' },
        requiredWhen: { field: 'creditType', operator: '==', value: 'hold_order' },
      },
      // 营业执照照片
      {
        key: 'businessLicensePhotos',
        label: '客户营业执照',
        type: 'photo',
        required: true,
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
    ],
  },

  workflowDef: {
    nodes: [
      // 节点1：营销主管审批（仅营销师提交时需要）
      {
        order: 1,
        name: '营销主管',
        type: 'role',
        roleCode: 'marketing_manager',
        condition: { field: '_submitterRole', operator: '==', value: 'marketer' },
      },
      // 节点2：往来会计审批（仅营销师提交时需要）
      {
        order: 2,
        name: '往来会计',
        type: 'role',
        roleCode: 'current_accountant',
        condition: { field: '_submitterRole', operator: '==', value: 'marketer' },
      },
      // 节点3：总经理审批（始终需要）
      {
        order: 3,
        name: '总经理',
        type: 'role',
        roleCode: 'general_manager',
      },
    ],
  },

  // beforeSubmit: 注入提交者角色到 formData，供条件节点判断
  beforeSubmit: beforeSubmitCustomerCredit,

  // onApproved: 审批通过后调用 ERP API 更新授信信息
  onApproved: onApprovedCustomerCredit,
};
