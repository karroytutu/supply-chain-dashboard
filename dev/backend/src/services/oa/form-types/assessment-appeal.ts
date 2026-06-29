/**
 * 考核申诉 - 表单类型定义
 * @module services/oa/form-types/assessment-appeal
 *
 * 员工对考核结果提出申诉，审批通过后自动标记考核为"无需考核"。
 */

import { FormTypeDefinition } from '../oa.types';
import { OA_ROLE } from '../oa-role-codes';
import {
  onApprovedAssessmentAppeal,
  onRejectedAssessmentAppeal,
} from '../assessment-appeal-callback';

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
  version: 3,

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
        key: 'sourceNo',
        label: '来源编号',
        type: 'text',
        required: true,
        disabled: true,
      },
      {
        key: 'sourceName',
        label: '来源名称',
        type: 'text',
        required: true,
        disabled: true,
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
    // 系统数据：不参与权限配置和前端渲染
    internalFields: [
      { key: '_sourceNoUrl', label: '来源编号链接', type: 'text', required: false },
    ],
  },

  workflowDef: {
    nodes: [
      {
        order: 1,
        name: '总经理审批',
        type: 'approval',
        handler: { roleCode: OA_ROLE.GM },
        signMode: 'or',
      },
    ],
  },

  onApproved: onApprovedAssessmentAppeal,
  onRejected: onRejectedAssessmentAppeal,
  fieldPermissions: {
    nodes: {
      "0": { "sourceNo": "editable", "sourceName": "editable", "appealReason": "editable", "assessmentId": "editable", "penaltyAmount": "editable", "assessmentCategory": "editable", "assessmentRuleType": "editable", "assessmentUserName": "editable", "supportingDocuments": "editable" },
      "1": { "sourceNo": "readonly", "sourceName": "readonly", "appealReason": "readonly", "assessmentId": "readonly", "penaltyAmount": "readonly", "assessmentCategory": "readonly", "assessmentRuleType": "readonly", "assessmentUserName": "readonly", "supportingDocuments": "readonly" }
    },
  },
};
