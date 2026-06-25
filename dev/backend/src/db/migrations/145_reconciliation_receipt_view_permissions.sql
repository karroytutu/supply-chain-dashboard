-- 145: 对账单表单"对账回单"字段补充查看权限配置
-- 迁移140已为 reconciliationReceipt 配置了 field_permissions（节点级编辑/只读/隐藏），
-- 但未同步初始化 view_permissions。此补丁为已有 view_permissions 的节点补充该字段的查看权限。
-- 策略：与 field_permissions 对齐——字段隐藏的节点查看权限为 hidden，字段可见的节点为 readonly

BEGIN;

-- 节点0/2/3/4/5：field_permissions 为 hidden → 查看权限 hidden
UPDATE oa_form_types
SET view_permissions = jsonb_set(view_permissions,
  '{nodes,0,reconciliationReceipt}', '"hidden"'
)
WHERE code = 'customer_reconciliation'
  AND view_permissions IS NOT NULL
  AND view_permissions->'nodes' ? '0';

UPDATE oa_form_types
SET view_permissions = jsonb_set(view_permissions,
  '{nodes,4,reconciliationReceipt}', '"hidden"'
)
WHERE code = 'customer_reconciliation'
  AND view_permissions IS NOT NULL
  AND view_permissions->'nodes' ? '4';

UPDATE oa_form_types
SET view_permissions = jsonb_set(view_permissions,
  '{nodes,5,reconciliationReceipt}', '"hidden"'
)
WHERE code = 'customer_reconciliation'
  AND view_permissions IS NOT NULL
  AND view_permissions->'nodes' ? '5';

-- 节点6/7/8：field_permissions 为 editable/readonly → 查看权限 readonly
UPDATE oa_form_types
SET view_permissions = jsonb_set(view_permissions,
  '{nodes,6,reconciliationReceipt}', '"readonly"'
)
WHERE code = 'customer_reconciliation'
  AND view_permissions IS NOT NULL
  AND view_permissions->'nodes' ? '6';

UPDATE oa_form_types
SET view_permissions = jsonb_set(view_permissions,
  '{nodes,7,reconciliationReceipt}', '"readonly"'
)
WHERE code = 'customer_reconciliation'
  AND view_permissions IS NOT NULL
  AND view_permissions->'nodes' ? '7';

COMMIT;
