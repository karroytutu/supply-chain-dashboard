/**
 * 固定资产领用调拨申请 - OA 表单类型定义
 * @module services/oa-approval/form-types/asset-transfer
 */

import { FormTypeDefinition } from '../oa-approval.types';
import { handleAssetTransferApproved } from '../../fixed-asset/transfer-callback';

export const assetTransferFormType: FormTypeDefinition = {
  code: 'asset_transfer',
  name: '固定资产领用调拨申请',
  icon: 'SwapOutlined',
  category: 'admin',
  sortOrder: 20,
  description: '固定资产领用/调拨审批（支持多资产）',
  version: 1,

  formSchema: {
    fields: [
      {
        key: 'transferType', label: '申请类型', type: 'select', required: true,
        options: [
          { value: 'requisition', label: '领用' },
          { value: 'transfer', label: '调拨' },
        ],
      },
      { key: 'transferDate', label: '领用/调拨日期', type: 'date', required: true },
      { key: 'reason', label: '原因', type: 'textarea', required: true, maxLength: 500 },
      {
        key: 'lines', label: '资产明细', type: 'table', required: true,
        children: [
          { key: 'erpAssetId', label: '资产ID', type: 'number', required: true },
          { key: 'assetNo', label: '资产编号', type: 'text', required: false },
          { key: 'assetName', label: '资产名称', type: 'text', required: false },
          { key: 'toDeptId', label: '新使用部门', type: 'number', required: true },
          { key: 'toUserId', label: '新使用人', type: 'number', required: true },
          { key: 'toDepositAddress', label: '新存放地点', type: 'text', required: false },
        ],
      },
    ],
  },

  workflowDef: {
    nodes: [
      { order: 1, name: '行政专员审批', type: 'role', roleCode: 'admin_staff' },
    ],
    ccRoles: ['admin'],
  },

  onApproved: handleAssetTransferApproved,
};
