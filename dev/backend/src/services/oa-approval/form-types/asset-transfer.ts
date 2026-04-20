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
  version: 2,

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
          {
            key: 'assetSearch', label: '选择资产', type: 'asset_search', required: true,
            searchApi: 'erp_assets',
            autoFill: {
              erpAssetId: 'id',
              assetNo: 'assetNo',
              assetName: 'name',
              specification: 'specification',
              originalValue: 'originalValue',
              currentDeptName: 'deptName',
              currentUserName: 'userName',
            },
            displayFields: ['assetNo', 'name', 'specification'],
          },
          { key: 'erpAssetId', label: '资产ID', type: 'number', required: false, disabled: true },
          { key: 'assetNo', label: '资产编号', type: 'text', required: false, disabled: true },
          { key: 'assetName', label: '资产名称', type: 'text', required: false, disabled: true },
          {
            key: 'toDeptId', label: '新使用部门', type: 'erp_department', required: true,
            searchApi: 'erp_departments',
          },
          {
            key: 'toUserId', label: '新使用人', type: 'erp_staff', required: true,
            searchApi: 'erp_staff', cascadeFrom: 'toDeptId',
          },
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

  /** 提交前校验：确保每行都选择了资产 */
  beforeSubmit: async (formData) => {
    const lines = formData.lines as Array<Record<string, unknown>> | undefined;
    if (!lines || lines.length === 0) {
      throw new Error('请至少添加一条资产明细');
    }
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].erpAssetId) {
        throw new Error(`第${i + 1}行未选择资产，请通过资产搜索选择`);
      }
    }
    return {};
  },

  onApproved: handleAssetTransferApproved,
};
