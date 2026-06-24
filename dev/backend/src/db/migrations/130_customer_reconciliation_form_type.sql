-- 130: 应收对账表单类型种子数据
-- 代码定义为权威来源（form-types/customer-reconciliation.ts），此迁移仅为 oa_form_types 表提供元数据

INSERT INTO oa_form_types (code, name, icon, category, sort_order, description, form_schema, workflow_def, is_active, version)
VALUES (
  'customer_reconciliation',
  '应收对账',
  'AuditOutlined',
  'finance',
  100,
  '结算会计与客户之间的应收对账流程，支持对账单创建、单据领出、差异审核',
  '{"fields":[]}'::jsonb,
  '{"nodes":[]}'::jsonb,
  true,
  1
)
ON CONFLICT (code) DO NOTHING;
