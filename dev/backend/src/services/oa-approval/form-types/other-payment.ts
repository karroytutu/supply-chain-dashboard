/**
 * 其他付款申请单 - 表单类型定义
 * @module services/oa-approval/form-types/other-payment
 * 
 * 这是一个参考实现，展示了如何定义一个新的审批表单类型。
 * 新增表单类型时，请参考此文件的结构。
 */

import { FormTypeDefinition } from '../oa-approval.types';

/**
 * 其他付款申请单表单类型定义
 */
export const otherPaymentFormType: FormTypeDefinition = {
  // 唯一编码，kebab-case 命名
  code: 'other_payment',

  // 显示名称
  name: '其他付款申请单',

  // 图标（Ant Design Icon 名称或 emoji）
  icon: 'PayCircleOutlined',

  // 分类
  category: 'finance',

  // 排序（同分类内）
  sortOrder: 100,

  // 描述说明
  description: '用于其他付款事项的审批申请',

  // 版本号（修改表单结构时递增）
  version: 1,

  // 表单字段定义
  formSchema: {
    fields: [
      {
        key: 'payeeName',
        label: '收款方',
        type: 'text',
        required: true,
        placeholder: '请输入收款方名称',
      },
      {
        key: 'amount',
        label: '付款金额',
        type: 'money',
        required: true,
        placeholder: '请输入金额',
        upper: true, // 显示大写金额
      },
      {
        key: 'paymentReason',
        label: '付款事由',
        type: 'textarea',
        required: true,
        maxLength: 500,
        placeholder: '请输入付款事由',
      },
      {
        key: 'attachmentUrls',
        label: '附件',
        type: 'upload',
        required: false,
        maxCount: 5,
      },
      {
        key: 'remark',
        label: '备注',
        type: 'textarea',
        required: false,
        maxLength: 200,
        placeholder: '请输入备注（可选）',
      },
    ],
  },

  // 审批流程定义
  workflowDef: {
    nodes: [
      {
        order: 1,
        name: '直属主管',
        type: 'dynamic_supervisor',
      },
      {
        order: 2,
        name: '财务审核',
        type: 'role',
        roleCode: 'finance_staff',
      },
      {
        // 条件节点：金额超过 50000 元才需要总经理审批
        order: 3,
        name: '总经理',
        type: 'role',
        roleCode: 'admin',
        condition: {
          field: 'amount',
          operator: '>',
          value: 50000,
        },
      },
    ],
    // 抄送角色
    ccRoles: ['cashier'],
  },
};

export default otherPaymentFormType;
