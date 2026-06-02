-- =====================================================
-- 073: 客户档案修改表单 - 同步 form_schema 与 TypeScript 定义
-- 注意: 编号 072 被跳过（合并到 073 中），不补编号避免重复执行
-- 修正项：
--   1. customer autoFill 增加 customerState 状态自动填充
--   2. customerState 选项改为3种（启用/待确认/停用），数值value
--   3. consumerManagerName(text) → consumerManagerId(erp_staff)
--   4. 移除已废弃的 debtAmount 字段
--   5. 补充缺失的 _consumerManagerName 隐藏字段
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
      }
    ]
  }'::jsonb,
  version = 2
WHERE code = 'customer_modify';
