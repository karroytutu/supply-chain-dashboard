/**
 * 固定资产维修申请 - OA 表单类型定义
 * 含条件分支：≥500元需行政询价（至少2家供应商）
 * @module services/oa-approval/form-types/asset-maintenance
 */

import { FormTypeDefinition } from '../oa-approval.types';
import { handleAssetMaintenanceNodeCallback } from '../../fixed-asset/fixed-asset-callback';

export const assetMaintenanceFormType: FormTypeDefinition = {
  code: 'asset_maintenance',
  name: '固定资产维修申请',
  icon: 'ToolOutlined',
  category: 'admin',
  sortOrder: 30,
  description: '固定资产维修审批（含条件询价和财务支付）',
  version: 1,

  formSchema: {
    fields: [
      { key: 'erpAssetId', label: '资产ID', type: 'number', required: true },
      { key: 'assetNo', label: '资产编号', type: 'text', required: false },
      { key: 'assetName', label: '资产名称', type: 'text', required: false },
      { key: 'description', label: '故障描述', type: 'textarea', required: true, maxLength: 500 },
      { key: 'estimatedCost', label: '预估维修费用', type: 'money', required: true, min: 100 },
      {
        key: 'urgency', label: '紧急程度', type: 'select', required: true,
        options: [
          { value: 'normal', label: '普通' },
          { value: 'urgent', label: '紧急' },
          { value: 'critical', label: '特急' },
        ],
      },
      { key: 'attachmentUrls', label: '附件', type: 'upload', required: false, maxCount: 10 },
    ],
  },

  workflowDef: {
    nodes: [
      { order: 1, name: '需求提报', type: 'role', roleCode: 'admin' },
      {
        order: 2, name: '行政询价', type: 'data_input', roleCode: 'admin_staff',
        condition: { field: 'estimatedCost', operator: '>=', value: 500 },
        inputSchema: {
          fields: [
            { name: 'quotations', label: '询价结果', type: 'table', required: true, columns: [
              { name: 'supplierName', label: '供应商', type: 'text', required: true },
              { name: 'quotationPrice', label: '报价', type: 'amount', required: true },
              { name: 'quotationNote', label: '备注', type: 'text', required: false },
            ]},
          ],
        },
      },
      { order: 3, name: '总经理审批', type: 'role', roleCode: 'admin' },
      {
        order: 4, name: '财务支付', type: 'data_input', roleCode: 'cashier',
        inputSchema: {
          fields: [
            { name: 'paymentAmount', label: '支付金额', type: 'amount', required: true },
            { name: 'paymentDate', label: '支付日期', type: 'date', required: true },
            { name: 'paymentSubjectId', label: '付款账户', type: 'number', required: true },
            { name: 'receiptUrls', label: '支付回单', type: 'upload', required: false },
            { name: 'paymentNote', label: '支付备注', type: 'text', required: false },
          ],
        },
      },
    ],
    ccRoles: ['current_accountant'],
  },

  onNodeCompleted: handleAssetMaintenanceNodeCallback,
};
