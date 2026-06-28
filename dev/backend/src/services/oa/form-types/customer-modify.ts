/**
 * 客户档案修改 - 表单类型定义
 * @module services/oa/form-types/customer-modify
 */

import { FormTypeDefinition } from '../oa.types';
import { OA_ROLE } from '../oa-role-codes';
import { beforeSubmitCustomerModify, onApprovedCustomerModify } from '../customer-modify-callback';

/**
 * 客户档案修改表单类型定义
 * 选择 ERP 客户后展示并编辑客户档案信息
 * 审批流：营销经理 → 自动更新ERP客户档案
 * 业务规则：有欠款的客户不允许停用
 */
export const customerModifyFormType: FormTypeDefinition = {
  code: 'customer_modify',
  name: '客户档案修改',
  icon: 'UserSwitchOutlined',
  category: 'marketing',
  sortOrder: 120,
  description: '修改ERP客户档案信息，包括名称、门头照、联系人、等级、渠道、片区、状态等',
  version: 3,

  formSchema: {
    fields: [
      // ===== 客户选择 =====
      {
        key: 'customer',
        label: '客户',
        type: 'select',
        required: true,
        searchApi: 'erp_customers',
        nameField: '_customerName',
        autoFill: {
          customerName: 'name',
          contactName: 'contactName',
          contactTel: 'contactTel',
          gradeId: 'gradeId',
          groupId: 'groupId',
          areaId: 'areaId',
          consumerManagerId: 'consumerManagerId',
          _consumerManagerName: 'consumerManagerName',
          _storefrontPhotoUrl: 'picture',
          customerState: 'state', // 选中客户后自动填充其当前状态
        },
      },

      // ===== 基本信息（autoFill 填充，可编辑） =====
      {
        key: 'customerName',
        label: '修改客户名称',
        type: 'text',
        required: true,
      },
      {
        key: 'contactName',
        label: '联系人',
        type: 'text',
        required: false,
      },
      {
        key: 'contactTel',
        label: '联系电话',
        type: 'text',
        required: false,
      },

      // ===== 分类信息（ERP 下拉选择） =====
      {
        key: 'gradeId',
        label: '等级',
        type: 'select',
        required: false,
        searchApi: 'erp_grades',
      },
      {
        key: 'groupId',
        label: '渠道',
        type: 'select',
        required: false,
        searchApi: 'erp_groups',
      },
      {
        key: 'areaId',
        label: '片区',
        type: 'select',
        required: false,
        searchApi: 'erp_areas',
      },

      // ===== 人员信息 =====
      {
        key: 'consumerManagerId',
        label: '所属营销',
        type: 'select',
        required: false,
        searchApi: 'erp_staff',
        nameField: '_consumerManagerName',
      },
      {
        key: 'serviceStaffId',
        label: '服务员工',
        type: 'select',
        required: false,
        searchApi: 'erp_staff',
        nameField: '_serviceStaffName',
      },

      // ===== 状态 =====
      {
        key: 'customerState',
        label: '状态',
        type: 'select',
        required: true,
        // 值由 autoFill 从选中客户的 state 字段自动填充，不设默认值
        options: [
          { value: 1, label: '启用' },
          { value: 2, label: '待确认' },
          { value: 0, label: '停用' },
        ],
      },

      // ===== 门头照 =====
      {
        key: 'storefrontPhoto',
        label: '门头照',
        type: 'photo',
        required: false,
        maxCount: 1,
        photoPurpose: 'storefront',
      },

      // ===== 修改说明 =====
      {
        key: 'remark',
        label: '修改说明',
        type: 'textarea',
        required: false,
        maxLength: 500,
      },

    ],
    // 系统数据：不参与权限配置和前端渲染
    internalFields: [
      { key: '_customerName', label: '客户名称', type: 'text', required: false },
      { key: '_storefrontPhotoUrl', label: '当前门头照', type: 'text', required: false },
      { key: '_serviceStaffName', label: '服务员工名称', type: 'text', required: false },
      { key: '_consumerManagerName', label: '所属营销名称', type: 'text', required: false },
      { key: '_original_customerName', label: '原客户名称', type: 'text', required: false },
      { key: '_original_contactName', label: '原联系人', type: 'text', required: false },
      { key: '_original_contactTel', label: '原联系电话', type: 'text', required: false },
      { key: '_original_gradeId', label: '原等级ID', type: 'text', required: false },
      { key: '_original_gradeName', label: '原等级名称', type: 'text', required: false },
      { key: '_original_groupId', label: '原渠道ID', type: 'text', required: false },
      { key: '_original_groupName', label: '原渠道名称', type: 'text', required: false },
      { key: '_original_areaId', label: '原片区ID', type: 'text', required: false },
      { key: '_original_areaName', label: '原片区名称', type: 'text', required: false },
      { key: '_original_consumerManagerId', label: '原所属营销ID', type: 'text', required: false },
      { key: '_original_consumerManagerName', label: '原所属营销名称', type: 'text', required: false },
      { key: '_original_customerState', label: '原状态', type: 'text', required: false },
      { key: '_original_storefrontPhotoUrl', label: '原门头照URL', type: 'text', required: false },
    ],
  },

  workflowDef: {
    nodes: [
      // 节点1：营销经理审批
      {
        order: 1,
        name: '营销经理审批',
        type: 'approval',
        handler: { roleCode: OA_ROLE.MARKETING_MGR },
        signMode: 'or',
      },
      // 节点2：自动更新ERP客户档案
      {
        order: 2,
        name: '更新ERP客户档案',
        type: 'auto',
      },
    ],
  },

  // beforeSubmit: 校验提交者角色、补全客户名称
  beforeSubmit: beforeSubmitCustomerModify,

  // onApproved: 审批通过后更新 ERP 客户档案（含欠款再校验）
  onApproved: onApprovedCustomerModify,
};
