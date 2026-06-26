-- 146: 促销活动申请表单类型种子数据
-- 代码定义为权威来源（form-types/promotion-*-offline.ts），此迁移仅为 oa_form_types 表提供元数据

BEGIN;

-- 线下组合搭赠
INSERT INTO oa_form_types (code, name, icon, category, sort_order, description, form_schema, workflow_def, is_active, version)
VALUES (
  'promotion_combined_offline',
  '线下组合搭赠申请',
  'GiftOutlined',
  'marketing',
  200,
  '线下组合搭赠促销活动申请，购买主品赠送赠品',
  '{"fields":[]}'::jsonb,
  '{"nodes":[]}'::jsonb,
  true,
  1
)
ON CONFLICT (code) DO NOTHING;

-- 线下限时特价
INSERT INTO oa_form_types (code, name, icon, category, sort_order, description, form_schema, workflow_def, is_active, version)
VALUES (
  'promotion_special_offline',
  '线下限时特价申请',
  'ThunderboltOutlined',
  'marketing',
  210,
  '线下限时特价促销活动申请，商品限时降价销售',
  '{"fields":[]}'::jsonb,
  '{"nodes":[]}'::jsonb,
  true,
  1
)
ON CONFLICT (code) DO NOTHING;

-- 线下满赠
INSERT INTO oa_form_types (code, name, icon, category, sort_order, description, form_schema, workflow_def, is_active, version)
VALUES (
  'promotion_fullgift_offline',
  '线下满赠申请',
  'ShoppingOutlined',
  'marketing',
  220,
  '线下满赠促销活动申请，消费满额赠送商品',
  '{"fields":[]}'::jsonb,
  '{"nodes":[]}'::jsonb,
  true,
  1
)
ON CONFLICT (code) DO NOTHING;

COMMIT;
