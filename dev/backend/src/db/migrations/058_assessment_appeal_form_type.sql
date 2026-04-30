-- =====================================================
-- 058: 考核申诉OA表单类型
-- =====================================================

INSERT INTO oa_form_types (code, name, icon, category, sort_order, description, form_schema, workflow_def, is_active, version)
VALUES (
  'assessment_appeal',
  '考核申诉',
  'AuditOutlined',
  'supply_chain',
  50,
  '员工对考核结果提出申诉',
  '{
    "fields": [
      {
        "key": "assessmentId",
        "label": "考核记录ID",
        "type": "number",
        "required": true,
        "disabled": true
      },
      {
        "key": "assessmentCategory",
        "label": "考核类别",
        "type": "select",
        "required": true,
        "disabled": true,
        "options": [
          {"value": "ar_collection", "label": "催收考核"},
          {"value": "return_order", "label": "退货考核"}
        ]
      },
      {
        "key": "assessmentRuleType",
        "label": "考核规则",
        "type": "text",
        "required": true,
        "disabled": true
      },
      {
        "key": "assessmentUserName",
        "label": "被考核人",
        "type": "text",
        "required": true,
        "disabled": true
      },
      {
        "key": "penaltyAmount",
        "label": "考核金额(元)",
        "type": "money",
        "required": true,
        "disabled": true
      },
      {
        "key": "appealReason",
        "label": "申诉理由",
        "type": "textarea",
        "required": true,
        "maxLength": 500,
        "placeholder": "请详细说明申诉原因"
      },
      {
        "key": "supportingDocuments",
        "label": "支持性材料",
        "type": "upload",
        "required": false,
        "maxCount": 5
      }
    ]
  }'::jsonb,
  '{
    "nodes": [
      {
        "order": 1,
        "name": "直属主管初审",
        "type": "dynamic_supervisor"
      },
      {
        "order": 2,
        "name": "部门负责人审核",
        "type": "role",
        "roleCode": "operations_manager"
      }
    ]
  }'::jsonb,
  true,
  1
)
ON CONFLICT (code) DO NOTHING;
