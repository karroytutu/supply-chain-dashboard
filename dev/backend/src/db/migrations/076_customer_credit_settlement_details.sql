-- 客户授信申请（压单）：新增结算单明细字段，审批详情页可展示金额
-- form_schema 更新 holdSettlementOrders 字段的 nameField/_detailsField 为 _ 前缀，并追加隐藏字段
-- version 5 → 6

UPDATE oa_form_types
SET
  form_schema = (
    -- 先修改 holdSettlementOrders 字段（加 detailsField），再追加隐藏字段
    SELECT jsonb_set(
      modified_schema,
      '{fields}',
      (modified_schema->'fields') || '[{"key":"_holdSettlementOrderDetails","label":"压单结算单明细","type":"text","required":false}]'::jsonb
    )
    FROM (
      SELECT jsonb_set(
        form_schema,
        '{fields}',
        (
          SELECT jsonb_agg(
            CASE
              WHEN elem->>'key' = 'holdSettlementOrders'
              THEN jsonb_set(
                jsonb_set(elem, '{detailsField}', '"_holdSettlementOrderDetails"'),
                '{nameField}', '"_holdSettlementOrderNames"'
              )
              ELSE elem
            END
          )
          FROM jsonb_array_elements(form_schema->'fields') AS elem
        )
      ) AS modified_schema
    ) sub
  ),
  version = 6,
  updated_at = NOW()
WHERE code = 'customer_credit';
