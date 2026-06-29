/**
 * 固定资产维修申请 - OA 表单类型定义
 * 含条件分支：≥500元需行政询价（至少2家供应商）
 * @module services/oa/form-types/asset-maintenance
 */

import { FormTypeDefinition } from '../oa.types';
import { OA_ROLE } from '../oa-role-codes';
import { handleMaintenanceAutoNode } from '../../fixed-asset/maintenance-callback';

export const assetMaintenanceFormType: FormTypeDefinition = {
  code: 'asset_maintenance',
  name: '固定资产维修申请',
  icon: 'ToolOutlined',
  category: 'admin',
  sortOrder: 30,
  description: '固定资产维修审批（含条件询价和财务支付）',
  version: 5,

  formSchema: {
    fields: [
      {
        key: 'assetSearch',
        label: '选择资产',
        type: 'select',
        required: true,
        searchApi: 'erp_assets',
        autoFill: {
          erpAssetId: 'id',
          assetNo: 'assetNo',
          assetName: 'name',
          specification: 'specification',
          originalValue: 'originalValue',
        },
        displayFields: ['assetNo', 'name', 'specification'],
      },
      { key: 'erpAssetId', label: '资产ID', type: 'number', required: false, disabled: true },
      { key: 'assetNo', label: '资产编号', type: 'text', required: false, disabled: true },
      { key: 'assetName', label: '资产名称', type: 'text', required: false, disabled: true },
      { key: 'description', label: '故障描述', type: 'textarea', required: true, maxLength: 500 },
      { key: 'estimatedCost', label: '预估维修费用', type: 'money', required: true, min: 100 },
      {
        key: 'urgency',
        label: '紧急程度',
        type: 'select',
        required: true,
        options: [
          { value: 'normal', label: '普通' },
          { value: 'urgent', label: '紧急' },
          { value: 'critical', label: '特急' },
        ],
      },
      { key: 'attachmentUrls', label: '附件', type: 'upload', required: false, maxCount: 10 },

      // ═══ 办理环节字段（原 inputSchema 迁移至主表单） ═══
      // 询价结果表格（仅当预估费用≥500元时显示）
      {
        key: 'quotations',
        label: '询价结果',
        type: 'table',
        required: false,
        visibleWhen: { field: 'estimatedCost', operator: '>=', value: 500 },
        statField: [
          { componentId: 'quotationPrice', label: '报价合计' },
        ],
        children: [
          { key: 'supplierName', label: '供应商', type: 'text', required: true },
          { key: 'quotationPrice', label: '报价', type: 'money', required: true },
          { key: 'quotationNote', label: '备注', type: 'text', required: false },
        ],
      },
      // 财务支付环节字段
      { key: 'paymentAmount', label: '支付金额', type: 'money', required: false },
      { key: 'paymentDate', label: '支付日期', type: 'date', required: false },
      {
        key: 'paymentSubjectId',
        label: '付款账户',
        type: 'select',
        required: false,
        searchApi: 'erp_payment_accounts',
        nameField: '_paymentSubjectName',
        autoFill: { _paymentSubjectName: 'name' },
      },
      { key: '_paymentSubjectName', label: '付款账户名称', type: 'text', required: false, hidden: true },
      { key: 'receiptUrls', label: '支付回单', type: 'upload', required: false },
      { key: 'paymentNote', label: '支付备注', type: 'text', required: false },

      // ═══ 系统回填字段（auto 节点执行后自动填入，只读） ═══
      { key: '_expenditureBillStr', label: '费用单号', type: 'text', required: false, disabled: true },
    ],
  },

  workflowDef: {
    nodes: [
      { order: 1, name: '需求提报', type: 'approval', handler: { roleCode: 'admin' }, signMode: 'or' },
      {
        order: 2,
        name: '行政询价',
        type: 'handle',
        handler: { roleCode: OA_ROLE.ADMIN_STAFF },
        signMode: 'or',
        condition: { field: 'estimatedCost', operator: '>=', value: 500 },
      },
      { order: 3, name: '总经理审批', type: 'approval', handler: { roleCode: OA_ROLE.GM }, signMode: 'or' },
      {
        order: 4,
        name: '财务支付',
        type: 'handle',
        handler: { roleCode: OA_ROLE.CASHIER },
        signMode: 'or',
      },
      { order: 5, name: '创建费用单', type: 'auto' },
      { order: 6, name: '抄送往来会计', type: 'cc' as const, ccRoles: [OA_ROLE.ACCOUNTANT] },
    ],
  },

  /** auto 节点回填声明 */
  nodeBackfills: [
    {
      nodeOrder: 5,
      description: '财务支付后系统自动创建费用单',
      erpMetaFields: ['expenditureBillId', 'expenditureBillStr'],
      formDataFields: ['_expenditureBillStr'],
    },
  ],

  /** 提交前校验：确保选择了资产且费用合法 */
  beforeSubmit: async formData => {
    if (!formData.erpAssetId) {
      throw new Error('请通过资产搜索选择要维修的资产');
    }
    const estimatedCost = Number(formData.estimatedCost);
    if (isNaN(estimatedCost) || estimatedCost < 100) {
      throw new Error('预估维修费用不能小于100元');
    }
    return {};
  },

  onApproved: handleMaintenanceAutoNode,
};
