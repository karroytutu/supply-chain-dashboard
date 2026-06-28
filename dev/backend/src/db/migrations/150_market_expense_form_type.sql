-- 150: 市场费用申请表单类型
-- 新增 market_expense 表单类型，支持现金/商品两种费用类型
-- 代码定义为权威来源，此迁移仅为 oa_form_types 表提供元数据种子
-- form_schema 和 workflow_def 已迁移为代码定义，不再写入 DB
-- =====================================================

INSERT INTO oa_form_types (code, name, icon, category, sort_order, description, is_active, version)
VALUES (
  'market_expense',
  '市场费用申请',
  'FundOutlined',
  'marketing',
  230,
  '申请市场费用（陈列费、临期处理费等），审批通过后自动创建ERP兑付协议',
  true,
  1
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active;
