-- =====================================================
-- 075: 客户档案修改表单 - 补充门头照变更对比字段
-- 新增 _original_storefrontPhotoUrl 隐藏字段
-- =====================================================

UPDATE oa_form_types
SET
  form_schema = jsonb_set(
    form_schema,
    '{fields}',
    form_schema->'fields' || '[
      {
        "key": "_original_storefrontPhotoUrl",
        "label": "原门头照URL",
        "type": "text",
        "required": false
      }
    ]'::jsonb
  ),
  version = 4
WHERE code = 'customer_modify';
