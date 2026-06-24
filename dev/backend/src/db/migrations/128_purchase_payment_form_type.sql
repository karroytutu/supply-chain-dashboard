-- 128: 采购付款申请表单类型种子数据
-- 代码定义为权威来源（form-types/purchase-payment.ts），此迁移仅为 oa_form_types 表提供元数据

INSERT INTO oa_form_types (code, name, icon, category, sort_order, description, form_schema, workflow_def, is_active, version)
VALUES (
  'purchase_payment',
  '采购付款申请单',
  'MoneyCollectOutlined',
  'finance',
  110,
  '采购付款申请：支持后付款（核销应付单据）和预付款两种模式',
  '{"fields":[]}'::jsonb,
  '{"nodes":[]}'::jsonb,
  true,
  1
)
ON CONFLICT (code) DO NOTHING;
