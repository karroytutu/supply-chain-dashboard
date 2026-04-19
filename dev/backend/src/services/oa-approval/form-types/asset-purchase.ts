/**
 * 固定资产采购申请 - OA 表单类型定义
 * @module services/oa-approval/form-types/asset-purchase
 */

import { FormTypeDefinition } from '../oa-approval.types';
import { handleAssetPurchaseNodeCallback } from '../../fixed-asset/fixed-asset-callback';
import { handleAssetTransferApproved } from '../../fixed-asset/fixed-asset-callback';

export const assetPurchaseFormType: FormTypeDefinition = {
  code: 'asset_purchase',
  name: '固定资产采购申请',
  icon: 'ShoppingCartOutlined',
  category: 'admin',
  sortOrder: 10,
  description: '固定资产采购审批流程（含询价、支付、入库）',
  version: 1,

  formSchema: {
    fields: [
      { key: 'purchaseReason', label: '采购原因', type: 'textarea', required: true, maxLength: 500 },
      {
        key: 'urgency', label: '紧急程度', type: 'select', required: true,
        options: [
          { value: 'normal', label: '普通' },
          { value: 'urgent', label: '紧急' },
          { value: 'critical', label: '特急' },
        ],
      },
      { key: 'attachmentUrls', label: '附件', type: 'upload', required: false, maxCount: 10 },
      {
        key: 'lines', label: '采购明细', type: 'table', required: true,
        children: [
          { key: 'assetName', label: '资产名称', type: 'text', required: true },
          { key: 'specification', label: '规格型号', type: 'text', required: false },
          { key: 'quantity', label: '数量', type: 'number', required: true, min: 1 },
          { key: 'estimatedBudget', label: '预估预算', type: 'money', required: true },
        ],
      },
    ],
  },

  workflowDef: {
    nodes: [
      { order: 1, name: '需求提报', type: 'role', roleCode: 'admin' },
      { order: 2, name: '总经理审批', type: 'role', roleCode: 'admin' },
      {
        order: 3, name: '行政询价', type: 'data_input', roleCode: 'admin_staff',
        inputSchema: {
          fields: [
            { name: 'lines', label: '询价结果', type: 'table', required: true, columns: [
              { name: 'supplierName', label: '供应商', type: 'text', required: true },
              { name: 'quotationPrice', label: '询价单价', type: 'amount', required: true },
              { name: 'assetTypeId', label: '资产分类', type: 'number', required: true },
              { name: 'deptId', label: '使用部门', type: 'number', required: false },
              { name: 'userId', label: '使用人', type: 'number', required: false },
              { name: 'depositAddress', label: '存放地点', type: 'text', required: false },
              { name: 'estimatedResidualValueRate', label: '残值率(%)', type: 'number', required: false },
              { name: 'depreciationMethod', label: '折旧方法', type: 'select', required: false, options: [
                { label: '年限平均法', value: 'YEARS_AVERAGE_METHOD' },
              ]},
              { name: 'estimatedServiceMonths', label: '使用月数', type: 'number', required: false },
            ]},
          ],
        },
      },
      { order: 4, name: '总经理审批', type: 'role', roleCode: 'admin' },
      {
        order: 5, name: '出纳支付', type: 'data_input', roleCode: 'cashier',
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
      {
        order: 6, name: '行政采购', type: 'data_input', roleCode: 'admin_staff',
        inputSchema: {
          fields: [
            { name: 'purchaseDate', label: '采购日期', type: 'date', required: true },
            { name: 'purchaseNote', label: '采购备注', type: 'text', required: false },
          ],
        },
      },
      {
        order: 7, name: '资产入库', type: 'data_input', roleCode: 'admin_staff',
        inputSchema: {
          fields: [
            { name: 'lines', label: '入库信息', type: 'table', required: true, columns: [
              { name: 'actualPrice', label: '实际单价', type: 'amount', required: true },
              { name: 'arrivalDate', label: '到货日期', type: 'date', required: true },
              { name: 'note', label: '备注', type: 'text', required: false },
            ]},
          ],
        },
      },
    ],
    ccRoles: ['current_accountant'],
  },

  onNodeCompleted: handleAssetPurchaseNodeCallback,
};
