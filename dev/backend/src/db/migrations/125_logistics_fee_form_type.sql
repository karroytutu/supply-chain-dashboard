-- 125: 物流装卸费用申请表单类型
-- 代码定义为权威来源，此迁移仅为 oa_form_types 表提供元数据种子
-- form_schema 和 workflow_def 的权威定义在代码中 (logistics-fee.ts)
-- =====================================================

INSERT INTO oa_form_types (code, name, icon, category, sort_order, description, form_schema, workflow_def, is_active, version)
VALUES (
  'logistics_fee',
  '物流装卸费用申请',
  'CarOutlined',
  'supply_chain',
  60,
  '申请支付物流费用、装卸费用，审批通过后自动创建ERP费用单、付款单和费用分摊单',
  '{"fields":[]}'::jsonb,
  '{"nodes":[]}'::jsonb,
  true,
  1
)
ON CONFLICT (code) DO NOTHING;
