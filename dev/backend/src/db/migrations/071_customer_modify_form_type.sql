-- =====================================================
-- 071: 客户档案修改OA表单类型
-- =====================================================

INSERT INTO oa_form_types (code, name, icon, category, sort_order, description, form_schema, workflow_def, is_active, version)
VALUES (
  'customer_modify',
  '客户档案修改',
  'UserSwitchOutlined',
  'marketing',
  120,
  '修改ERP客户档案信息，包括名称、门头照、联系人、等级、渠道、片区、状态等',
  '{
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
          "consumerManagerName": "consumerManagerName",
          "_storefrontPhotoUrl": "picture"
        }
      },
      {
        "key": "customerName",
        "label": "客户名称",
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
        "key": "consumerManagerName",
        "label": "所属营销",
        "type": "text",
        "required": false
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
          {"value": "1", "label": "启用"},
          {"value": "0", "label": "停用"}
        ]
      },
      {
        "key": "debtAmount",
        "label": "欠款金额(元)",
        "type": "money",
        "required": false,
        "disabled": true
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
      }
    ]
  }'::jsonb,
  '{
    "nodes": [
      {
        "order": 1,
        "name": "营销经理审批",
        "type": "role",
        "roleCode": "marketing_manager"
      },
      {
        "order": 2,
        "name": "更新ERP客户档案",
        "type": "auto"
      }
    ]
  }'::jsonb,
  true,
  1
)
ON CONFLICT (code) DO NOTHING;
