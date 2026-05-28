-- =====================================================
-- 066: 考核申诉表单增加来源信息字段 + 历史数据回填
-- =====================================================

-- 1. 更新 form_schema：新增 sourceNo、sourceName、_sourceUrl 字段
UPDATE oa_form_types
SET form_schema = '{
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
      "key": "sourceNo",
      "label": "来源编号",
      "type": "text",
      "required": true,
      "disabled": true
    },
    {
      "key": "sourceName",
      "label": "来源名称",
      "type": "text",
      "required": true,
      "disabled": true
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
    },
    {
      "key": "_sourceNoUrl",
      "label": "来源编号链接",
      "type": "text",
      "required": false,
      "disabled": true
    }
  ]
}'::jsonb,
    version = 2
WHERE code = 'assessment_appeal';

-- 2. 回填历史考核申诉实例的来源信息
-- 使用 CTE 避免 PostgreSQL 15 UPDATE ... FROM 中引用目标表的限制
WITH backfill AS (
  SELECT
    oi.id AS instance_id,
    ar.source_no,
    ar.source_name,
    ar.source_type,
    ar.source_id
  FROM oa_approval_instances oi
  JOIN oa_form_types ft ON ft.code = 'assessment_appeal' AND oi.form_type_id = ft.id
  JOIN assessment_records ar ON ar.id = (oi.form_data->>'assessmentId')::integer
  WHERE oi.form_data ? 'assessmentId'
    AND NOT (oi.form_data ? 'sourceNo')
)
UPDATE oa_approval_instances
SET form_data = jsonb_set(
  jsonb_set(
    jsonb_set(
      oa_approval_instances.form_data,
      '{sourceNo}',
      COALESCE(to_jsonb(bf.source_no), 'null'::jsonb)
    ),
    '{sourceName}',
    COALESCE(to_jsonb(bf.source_name), 'null'::jsonb)
  ),
  '{_sourceNoUrl}',
  CASE
    WHEN bf.source_type = 'ar_collection_task'
    THEN to_jsonb('/collection/task/' || bf.source_id::text)
    ELSE 'null'::jsonb
  END
)
FROM backfill bf
WHERE oa_approval_instances.id = bf.instance_id;
