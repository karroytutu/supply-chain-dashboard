-- 082: 修复 customer_credit 表单 customer 字段的 nameField 命名
-- 将 nameField 从 "customerName" 改为 "_customerName"
-- 修复原因：nameField 无 _ 前缀导致值无法被 form.validateFields() 返回，
-- 详情页 formData['customerName'] 为 undefined，降级到异步 API 查询
-- version 6 → 7

UPDATE oa_form_types
SET
  form_schema = jsonb_set(
    form_schema,
    '{fields}',
    (
      SELECT jsonb_agg(
        CASE
          WHEN elem->>'key' = 'customer'
          THEN jsonb_set(elem, '{nameField}', '"_customerName"')
          ELSE elem
        END
      )
      FROM jsonb_array_elements(form_schema->'fields') AS elem
    )
  ),
  version = 7,
  updated_at = NOW()
WHERE code = 'customer_credit'
  AND version = 6;

-- Rollback (if needed):
-- UPDATE oa_form_types
-- SET
--   form_schema = jsonb_set(
--     form_schema,
--     '{fields}',
--     (
--       SELECT jsonb_agg(
--         CASE
--           WHEN elem->>'key' = 'customer'
--           THEN jsonb_set(elem, '{nameField}', '"customerName"')
--           ELSE elem
--         END
--       )
--       FROM jsonb_array_elements(form_schema->'fields') AS elem
--     )
--   ),
--   version = 6,
--   updated_at = NOW()
-- WHERE code = 'customer_credit'
--   AND version = 7;
