/**
 * 考核申诉 - 表单类型定义
 * @module services/oa-approval/form-types/assessment-appeal
 *
 * 员工对考核结果提出申诉，审批通过后自动标记考核为"无需考核"。
 */

import { FormTypeDefinition } from '../oa-approval.types';
import { onApprovedAssessmentAppeal, onRejectedAssessmentAppeal } from '../assessment-appeal-callback';

/**
 * 考核申诉表单类型定义
 */
export const assessmentAppealFormType: FormTypeDefinition = {
  code: 'assessment_appeal',
  name: '考核申诉',
  icon: 'AuditOutlined',
  category: 'supply_chain',
  sortOrder: 50,
  description: '员工对考核结果提出申诉',
  version: 1,

  formSchema: {
    fields: [
      {
        key: 'assessmentId',
        label: '考核记录ID',
        type: 'number',
        required: true,
        disabled: true,
      },
      {
        key: 'assessmentCategory',
        label: '考核类别',
        type: 'select',
        required: true,
        disabled: true,
        options: [
          { value: 'ar_collection', label: '催收考核' },
          { value: 'return_order', label: '退货考核' },
        ],
      },
      {
        key: 'assessmentRuleType',
        label: '考核规则',
        type: 'text',
        required: true,
        disabled: true,
      },
      {
        key: 'assessmentUserName',
        label: '被考核人',
        type: 'text',
        required: true,
        disabled: true,
      },
      {
        key: 'penaltyAmount',
        label: '考核金额(元)',
        type: 'money',
        required: true,
        disabled: true,
      },
      {
        key: 'appealReason',
        label: '申诉理由',
        type: 'textarea',
        required: true,
        maxLength: 500,
        placeholder: '请详细说明申诉原因',
      },
      {
        key: 'supportingDocuments',
        label: '支持性材料',
        type: 'upload',
        required: false,
        maxCount: 5,
      },
    ],
  },

  workflowDef: {
    nodes: [
      {
        order: 1,
        name: '直属主管初审',
        type: 'dynamic_supervisor',
      },
      {
        order: 2,
        name: '部门负责人审核',
        type: 'role',
        roleCode: 'operations_manager',
      },
    ],
  },

  onApproved: onApprovedAssessmentAppeal,
  onRejected: onRejectedAssessmentAppeal,
};
