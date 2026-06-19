-- 104: 催收账单明细表新增"核销情况"列
-- 用途：自动核销/手动核销时标记每笔单据的还款状态（已核销 / 空）
-- 不影响现有数据：旧实例的 billDetails 中无此字段，ReadonlyTable 渲染时显示为 "-"

UPDATE oa_form_types
SET
  form_schema = jsonb_set(
    form_schema,
    '{fields}',
    (SELECT jsonb_agg(
      CASE
        WHEN elem->>'key' = 'billDetails'
        THEN jsonb_set(elem, '{children}',
          elem->'children' || '[{"key":"verifyStatus","label":"核销情况","type":"text","required":false}]'::jsonb)
        ELSE elem
      END
    ) FROM jsonb_array_elements(form_schema->'fields') AS elem)
  ),
  version = version + 1,
  updated_at = NOW()
WHERE code = 'ar_collection';
