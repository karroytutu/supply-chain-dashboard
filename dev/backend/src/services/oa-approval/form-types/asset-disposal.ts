/**
 * 固定资产清理申请 - OA 表单类型定义
 * @module services/oa-approval/form-types/asset-disposal
 */

import { FormTypeDefinition } from '../oa-approval.types';
import { handleAssetDisposalApproved } from '../../fixed-asset/disposal-callback';

export const assetDisposalFormType: FormTypeDefinition = {
  code: 'asset_disposal',
  name: '固定资产清理申请',
  icon: 'DeleteOutlined',
  category: 'admin',
  sortOrder: 40,
  description: '固定资产清理审批（支持出售/盘亏，有收入时自动创建收入单）',
  version: 1,

  formSchema: {
    fields: [
      { key: 'erpAssetId', label: '资产ID', type: 'number', required: true },
      { key: 'assetNo', label: '资产编号', type: 'text', required: false },
      { key: 'assetName', label: '资产名称', type: 'text', required: false },
      { key: 'originalValue', label: '原值', type: 'money', required: false },
      { key: 'accumulatedDepreciation', label: '累计折旧', type: 'money', required: false },
      { key: 'netValue', label: '净值', type: 'money', required: false },
      {
        key: 'disposalType', label: '清理方式', type: 'select', required: true,
        options: [
          { value: 'sale', label: '出售' },
          { value: 'inventory_loss', label: '盘亏' },
        ],
      },
      { key: 'disposalReason', label: '清理原因', type: 'textarea', required: true, maxLength: 500 },
      { key: 'hasIncome', label: '是否产生收入', type: 'select', required: true,
        options: [
          { value: 'true', label: '是' },
          { value: 'false', label: '否' },
        ],
      },
      { key: 'disposalValue', label: '处置收入', type: 'money', required: false,
        visibleWhen: { field: 'hasIncome', operator: '==', value: 'true' },
      },
      { key: 'disposalDate', label: '清理日期', type: 'date', required: true },
      { key: 'attachmentUrls', label: '附件', type: 'upload', required: false, maxCount: 10 },
    ],
  },

  workflowDef: {
    nodes: [
      { order: 1, name: '总经理审批', type: 'role', roleCode: 'admin' },
    ],
  },

  onApproved: handleAssetDisposalApproved,
};
