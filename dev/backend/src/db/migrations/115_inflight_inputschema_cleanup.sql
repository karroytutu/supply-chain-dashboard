-- 115: 在途审批单 inputSchema 清理 + form_data 字段重命名
-- 将手动脚本 scripts/migrate-inflight-inputschema.ts 转为自动迁移，确保部署时不会遗漏

-- 1. 清除在途审批单 handle 节点的 input_schema（新代码已不再使用，残留可能引发混淆）
UPDATE oa_approval_nodes
SET input_schema = NULL
WHERE id IN (
  SELECT n.id
  FROM oa_approval_nodes n
  JOIN oa_approval_instances i ON n.instance_id = i.id
  JOIN oa_form_types ft ON i.form_type_id = ft.id
  WHERE i.status = 'pending'
    AND n.input_schema IS NOT NULL
    AND ft.code IN ('procurement_order', 'asset_purchase', 'asset_maintenance')
);

-- 2. 将固定资产采购在途单据的 form_data.lines 重命名为 purchaseLines（适配字段名变更）
UPDATE oa_approval_instances
SET form_data = jsonb_set(
  form_data - 'lines',
  '{purchaseLines}',
  form_data->'lines'
)
WHERE id IN (
  SELECT i.id
  FROM oa_approval_instances i
  JOIN oa_form_types ft ON i.form_type_id = ft.id
  WHERE i.status = 'pending'
    AND ft.code = 'asset_purchase'
    AND form_data ? 'lines'
    AND NOT (form_data ? 'purchaseLines')
);
