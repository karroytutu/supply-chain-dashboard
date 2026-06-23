/**
 * 固定资产采购申请 - OA 表单类型定义
 * @module services/oa/form-types/asset-purchase
 */

import { FormTypeDefinition } from '../oa.types';
import { OA_ROLE } from '../oa-role-codes';
import { handleAssetPurchaseAutoNode } from '../../fixed-asset/purchase-callback';
import { generateApplicationNo } from '../../fixed-asset/erp-meta-utils';

export const assetPurchaseFormType: FormTypeDefinition = {
  code: 'asset_purchase',
  name: '固定资产采购申请',
  icon: 'ShoppingCartOutlined',
  category: 'admin',
  sortOrder: 10,
  description: '固定资产采购审批流程（含询价、支付、入库）',
  version: 5,

  formSchema: {
    fields: [
      // ═══ 申请人填写的采购明细 ═══
      {
        key: 'purchaseLines',
        label: '采购明细',
        type: 'table',
        required: true,
        children: [
          { key: 'assetName', label: '资产名称', type: 'text', required: true },
          { key: 'specification', label: '规格型号', type: 'text', required: false },
          { key: 'quantity', label: '数量', type: 'number', required: true, min: 1 },
          { key: 'estimatedBudget', label: '预估预算', type: 'money', required: true },
        ],
      },
      { key: 'remark', label: '采购备注', type: 'textarea', required: false, maxLength: 500 },
      { key: 'attachmentUrls', label: '附件', type: 'upload', required: false, maxCount: 10 },

      // ═══ 办理环节字段（原 inputSchema 迁移至主表单） ═══

      // 行政询价环节：询价结果表格（9列）
      {
        key: 'inquiryLines',
        label: '询价结果',
        type: 'table',
        required: false,
        children: [
          { key: 'supplierName', label: '供应商', type: 'text', required: true },
          { key: 'quotationPrice', label: '询价单价', type: 'money', required: true },
          {
            key: 'assetTypeId',
            label: '资产分类',
            type: 'erp_asset_category',
            required: true,
            searchApi: 'erp_asset_categories',
          },
          {
            key: 'deptId',
            label: '使用部门',
            type: 'erp_department',
            required: false,
            searchApi: 'erp_departments',
          },
          {
            key: 'userId',
            label: '使用人',
            type: 'erp_staff',
            required: false,
            searchApi: 'erp_staff',
            cascadeFrom: 'deptId',
          },
          { key: 'depositAddress', label: '存放地点', type: 'text', required: false },
          {
            key: 'estimatedResidualValueRate',
            label: '残值率(%)',
            type: 'number',
            required: false,
          },
          {
            key: 'depreciationMethod',
            label: '折旧方法',
            type: 'select',
            required: false,
            options: [{ label: '年限平均法', value: 'YEARS_AVERAGE_METHOD' }],
          },
          {
            key: 'estimatedServiceMonths',
            label: '使用月数',
            type: 'number',
            required: false,
          },
        ],
      },

      // 出纳支付环节字段
      { key: 'paymentAmount', label: '支付金额', type: 'money', required: false },
      { key: 'paymentDate', label: '支付日期', type: 'date', required: false },
      {
        key: 'paymentSubjectId',
        label: '付款账户',
        type: 'erp_payment_account',
        required: false,
        searchApi: 'erp_payment_accounts',
      },
      { key: 'receiptUrls', label: '支付回单', type: 'upload', required: false },
      { key: 'paymentNote', label: '支付备注', type: 'text', required: false },

      // 行政采购环节字段
      { key: 'purchaseDate', label: '采购日期', type: 'date', required: false },
      { key: 'purchaseNote', label: '采购备注', type: 'text', required: false },

      // 资产入库环节：入库信息表格（3列）
      {
        key: 'arrivalLines',
        label: '入库信息',
        type: 'table',
        required: false,
        children: [
          { key: 'actualPrice', label: '实际单价', type: 'money', required: true },
          { key: 'arrivalDate', label: '到货日期', type: 'date', required: true },
          { key: 'note', label: '备注', type: 'text', required: false },
        ],
      },

      // ═══ 系统回填字段（auto 节点执行后自动填入，只读） ═══
      { key: '_expenditureBillStr', label: '费用单号', type: 'text', required: false, disabled: true },
      { key: '_createdAssetCodes', label: '资产编号', type: 'text', required: false, disabled: true },
    ],
  },

  workflowDef: {
    nodes: [
      { order: 1, name: '需求提报', type: 'approval', handler: { roleCode: 'admin' }, signMode: 'or' },
      { order: 2, name: '总经理审批', type: 'approval', handler: { roleCode: OA_ROLE.GM }, signMode: 'or' },
      {
        order: 3,
        name: '行政询价',
        type: 'handle',
        handler: { roleCode: OA_ROLE.ADMIN_STAFF },
        signMode: 'or',
      },
      { order: 4, name: '总经理审批', type: 'approval', handler: { roleCode: OA_ROLE.GM }, signMode: 'or' },
      {
        order: 5,
        name: '出纳支付',
        type: 'handle',
        handler: { roleCode: OA_ROLE.CASHIER },
        signMode: 'or',
      },
      { order: 6, name: '创建费用单', type: 'auto' },
      {
        order: 7,
        name: '行政采购',
        type: 'handle',
        handler: { roleCode: OA_ROLE.ADMIN_STAFF },
        signMode: 'or',
      },
      {
        order: 8,
        name: '资产入库',
        type: 'handle',
        handler: { roleCode: OA_ROLE.ADMIN_STAFF },
        signMode: 'or',
      },
      { order: 9, name: '创建资产卡片', type: 'auto' },
      { order: 10, name: '抄送往来会计', type: 'cc' as const, ccRoles: [OA_ROLE.ACCOUNTANT] },
    ],
  },

  /** auto 节点回填声明 */
  nodeBackfills: [
    {
      nodeOrder: 6,
      description: '出纳支付后系统自动创建费用单',
      erpMetaFields: ['expenditureBillId', 'expenditureBillStr'],
      formDataFields: ['_expenditureBillStr'],
    },
    {
      nodeOrder: 9,
      description: '资产入库后系统自动创建资产卡片',
      erpMetaFields: ['createdAssets'],
      formDataFields: ['_createdAssetCodes'],
    },
  ],

  /** 提交前生成采购申请编号 */
  beforeSubmit: async () => {
    const applicationNo = await generateApplicationNo();
    return { applicationNo };
  },

  onApproved: handleAssetPurchaseAutoNode,
};
