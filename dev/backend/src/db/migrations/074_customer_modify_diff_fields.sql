-- =====================================================
-- 074: 客户档案修改表单 - 新增变更对比原始值字段
-- 新增 _original_* 隐藏字段，由 beforeSubmit 自动填充，
-- 用于审批详情页展示"原值 → 新值"变更对比
-- =====================================================

UPDATE oa_form_types
SET
  form_schema = '{
    "fields": [
      {
        "key": "customer",
        "label": "客户",
        "type": "erp_customer",
        "required": true,
        "searchApi": "erp_customers",
        "nameField": "_customerName",
        "autoFill": {
          "customerName": "name",
          "contactName": "contactName",
          "contactTel": "contactTel",
          "gradeId": "gradeId",
          "groupId": "groupId",
          "areaId": "areaId",
          "consumerManagerId": "consumerManagerId",
          "_consumerManagerName": "consumerManagerName",
          "_storefrontPhotoUrl": "picture",
          "customerState": "state"
        }
      },
      {
        "key": "customerName",
        "label": "修改客户名称",
        "type": "text",
        "required": true
      },
      {
        "key": "contactName",
        "label": "联系人",
        "type": "text",
        "required": false
      },
      {
        "key": "contactTel",
        "label": "联系电话",
        "type": "text",
        "required": false
      },
      {
        "key": "gradeId",
        "label": "等级",
        "type": "erp_grade",
        "required": false,
        "searchApi": "erp_grades"
      },
      {
        "key": "groupId",
        "label": "渠道",
        "type": "erp_group",
        "required": false,
        "searchApi": "erp_groups"
      },
      {
        "key": "areaId",
        "label": "片区",
        "type": "erp_area",
        "required": false,
        "searchApi": "erp_areas"
      },
      {
        "key": "consumerManagerId",
        "label": "所属营销",
        "type": "erp_staff",
        "required": false,
        "searchApi": "erp_staff",
        "nameField": "_consumerManagerName"
      },
      {
        "key": "serviceStaffId",
        "label": "服务员工",
        "type": "erp_staff",
        "required": false,
        "searchApi": "erp_staff",
        "nameField": "_serviceStaffName"
      },
      {
        "key": "customerState",
        "label": "状态",
        "type": "select",
        "required": true,
        "options": [
          {"value": 1, "label": "启用"},
          {"value": 2, "label": "待确认"},
          {"value": 0, "label": "停用"}
        ]
      },
      {
        "key": "storefrontPhoto",
        "label": "门头照",
        "type": "photo",
        "required": false,
        "maxCount": 1,
        "photoPurpose": "storefront"
      },
      {
        "key": "remark",
        "label": "修改说明",
        "type": "textarea",
        "required": false,
        "maxLength": 500
      },
      {
        "key": "_customerName",
        "label": "客户名称",
        "type": "text",
        "required": false
      },
      {
        "key": "_storefrontPhotoUrl",
        "label": "当前门头照",
        "type": "text",
        "required": false
      },
      {
        "key": "_serviceStaffName",
        "label": "服务员工名称",
        "type": "text",
        "required": false
      },
      {
        "key": "_consumerManagerName",
        "label": "所属营销名称",
        "type": "text",
        "required": false
      },
      {
        "key": "_original_customerName",
        "label": "原客户名称",
        "type": "text",
        "required": false
      },
      {
        "key": "_original_contactName",
        "label": "原联系人",
        "type": "text",
        "required": false
      },
      {
        "key": "_original_contactTel",
        "label": "原联系电话",
        "type": "text",
        "required": false
      },
      {
        "key": "_original_gradeId",
        "label": "原等级ID",
        "type": "text",
        "required": false
      },
      {
        "key": "_original_gradeName",
        "label": "原等级名称",
        "type": "text",
        "required": false
      },
      {
        "key": "_original_groupId",
        "label": "原渠道ID",
        "type": "text",
        "required": false
      },
      {
        "key": "_original_groupName",
        "label": "原渠道名称",
        "type": "text",
        "required": false
      },
      {
        "key": "_original_areaId",
        "label": "原片区ID",
        "type": "text",
        "required": false
      },
      {
        "key": "_original_areaName",
        "label": "原片区名称",
        "type": "text",
        "required": false
      },
      {
        "key": "_original_consumerManagerId",
        "label": "原所属营销ID",
        "type": "text",
        "required": false
      },
      {
        "key": "_original_consumerManagerName",
        "label": "原所属营销名称",
        "type": "text",
        "required": false
      },
      {
        "key": "_original_customerState",
        "label": "原状态",
        "type": "text",
        "required": false
      }
    ]
  }'::jsonb,
  version = 3
WHERE code = 'customer_modify';
