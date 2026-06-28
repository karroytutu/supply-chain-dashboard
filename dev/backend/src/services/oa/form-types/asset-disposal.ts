/**
 * 固定资产清理申请 - OA 表单类型定义
 * @module services/oa/form-types/asset-disposal
 */

import { FormTypeDefinition } from '../oa.types';
import { OA_ROLE } from '../oa-role-codes';
import { handleAssetDisposalApproved } from '../../fixed-asset/disposal-callback';

export const assetDisposalFormType: FormTypeDefinition = {
  code: 'asset_disposal',
  name: '固定资产清理申请',
  icon: 'DeleteOutlined',
  category: 'admin',
  sortOrder: 40,
  description: '固定资产清理审批（支持出售/盘亏，有收入时自动创建收入单）',
  version: 4,

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
          originalValue: 'originalValue',
          accumulatedDepreciation: 'accumulatedDepreciation',
          netValue: 'netValue',
        },
        displayFields: ['assetNo', 'name'],
      },
      { key: 'erpAssetId', label: '资产ID', type: 'number', required: false, disabled: true },
      { key: 'assetNo', label: '资产编号', type: 'text', required: false, disabled: true },
      { key: 'assetName', label: '资产名称', type: 'text', required: false, disabled: true },
      { key: 'originalValue', label: '原值', type: 'money', required: false, disabled: true },
      {
        key: 'accumulatedDepreciation',
        label: '累计折旧',
        type: 'money',
        required: false,
        disabled: true,
      },
      { key: 'netValue', label: '净值', type: 'money', required: false, disabled: true },
      {
        key: 'disposalType',
        label: '清理方式',
        type: 'select',
        required: true,
        options: [
          { value: 'sale', label: '出售' },
          { value: 'inventory_loss', label: '盘亏' },
        ],
      },
      {
        key: 'disposalReason',
        label: '清理原因',
        type: 'textarea',
        required: true,
        maxLength: 500,
      },
      {
        key: 'hasIncome',
        label: '是否产生收入',
        type: 'select',
        required: true,
        options: [
          { value: 'true', label: '是' },
          { value: 'false', label: '否' },
        ],
      },
      {
        key: 'disposalValue',
        label: '处置收入',
        type: 'money',
        required: false,
        visibleWhen: { field: 'hasIncome', operator: '==', value: 'true' },
        requiredWhen: { field: 'hasIncome', operator: '==', value: 'true' },
      },
      { key: 'disposalDate', label: '清理日期', type: 'date', required: true },
      { key: 'attachmentUrls', label: '附件', type: 'upload', required: false, maxCount: 10 },

      // ═══ 系统回填字段（auto 节点执行后自动填入，只读） ═══
      { key: '_clearBillStr', label: '清理单号', type: 'text', required: false, disabled: true },
      { key: '_incomeBillStr', label: '收入单号', type: 'text', required: false, disabled: true, visibleWhen: { field: 'hasIncome', operator: '==', value: 'true' } },
    ],
  },

  workflowDef: {
    nodes: [
      { order: 1, name: '总经理审批', type: 'approval', handler: { roleCode: OA_ROLE.GM }, signMode: 'or' },
      { order: 2, name: '创建清理单', type: 'auto' },
    ],
  },

  /** auto 节点回填声明 */
  nodeBackfills: [
    {
      nodeOrder: 2,
      description: '审批通过后系统自动创建清理单和收入单',
      erpMetaFields: ['clearBillId', 'clearBillStr', 'incomeBillId', 'incomeBillStr'],
      formDataFields: ['_clearBillStr', '_incomeBillStr'],
    },
  ],

  /** 提交前校验：确保选择了资产且条件字段合法 */
  beforeSubmit: async formData => {
    if (!formData.erpAssetId) {
      throw new Error('请通过资产搜索选择要清理的资产');
    }
    if (formData.hasIncome === 'true' && !formData.disposalValue) {
      throw new Error('产生收入时必须填写处置收入金额');
    }
    return {};
  },

  onApproved: handleAssetDisposalApproved,
};
