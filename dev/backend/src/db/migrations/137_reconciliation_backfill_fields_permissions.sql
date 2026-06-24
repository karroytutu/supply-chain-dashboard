-- 137: 对账领单流程新增「ERP对账单号」和「对账单PDF」字段权限
-- 对应 form-types/customer-reconciliation.ts 新增的 erpStatementNo / erpStatementPdf 字段
-- 节点0: hidden（对账单尚未创建）
-- 节点2-8: readonly（auto节点回填后只读展示）

UPDATE oa_form_types
SET field_permissions = jsonb_set(
  jsonb_set(field_permissions,
    '{nodes,0,erpStatementNo}', '"hidden"'),
    '{nodes,0,erpStatementPdf}', '"hidden"')
WHERE code = 'customer_reconciliation';

UPDATE oa_form_types
SET field_permissions = jsonb_set(
  jsonb_set(field_permissions,
    '{nodes,2,erpStatementNo}', '"readonly"'),
    '{nodes,2,erpStatementPdf}', '"readonly"')
WHERE code = 'customer_reconciliation';

UPDATE oa_form_types
SET field_permissions = jsonb_set(
  jsonb_set(field_permissions,
    '{nodes,3,erpStatementNo}', '"readonly"'),
    '{nodes,3,erpStatementPdf}', '"readonly"')
WHERE code = 'customer_reconciliation';

UPDATE oa_form_types
SET field_permissions = jsonb_set(
  jsonb_set(field_permissions,
    '{nodes,4,erpStatementNo}', '"readonly"'),
    '{nodes,4,erpStatementPdf}', '"readonly"')
WHERE code = 'customer_reconciliation';

UPDATE oa_form_types
SET field_permissions = jsonb_set(
  jsonb_set(field_permissions,
    '{nodes,5,erpStatementNo}', '"readonly"'),
    '{nodes,5,erpStatementPdf}', '"readonly"')
WHERE code = 'customer_reconciliation';

UPDATE oa_form_types
SET field_permissions = jsonb_set(
  jsonb_set(field_permissions,
    '{nodes,6,erpStatementNo}', '"readonly"'),
    '{nodes,6,erpStatementPdf}', '"readonly"')
WHERE code = 'customer_reconciliation';

UPDATE oa_form_types
SET field_permissions = jsonb_set(
  jsonb_set(field_permissions,
    '{nodes,7,erpStatementNo}', '"readonly"'),
    '{nodes,7,erpStatementPdf}', '"readonly"')
WHERE code = 'customer_reconciliation';

UPDATE oa_form_types
SET field_permissions = jsonb_set(
  jsonb_set(field_permissions,
    '{nodes,8,erpStatementNo}', '"readonly"'),
    '{nodes,8,erpStatementPdf}', '"readonly"')
WHERE code = 'customer_reconciliation';
