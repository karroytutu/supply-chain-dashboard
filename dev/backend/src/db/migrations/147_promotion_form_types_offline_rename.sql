-- 147: 促销表单类型添加"线下"标识
-- 将现有三种促销表单的 code 加 _offline 后缀，name 加"线下"前缀
-- 为后续商城版本预留空间，避免编码混淆

BEGIN;

-- 组合搭赠 → 线下组合搭赠
UPDATE oa_form_types
SET
  code = 'promotion_combined_offline',
  name = '线下组合搭赠申请',
  description = '线下组合搭赠促销活动申请，购买主品赠送赠品',
  updated_at = NOW()
WHERE code = 'promotion_combined';

-- 限时特价 → 线下限时特价
UPDATE oa_form_types
SET
  code = 'promotion_special_offline',
  name = '线下限时特价申请',
  description = '线下限时特价促销活动申请，商品限时降价销售',
  updated_at = NOW()
WHERE code = 'promotion_special';

-- 满赠 → 线下满赠
UPDATE oa_form_types
SET
  code = 'promotion_fullgift_offline',
  name = '线下满赠申请',
  description = '线下满赠促销活动申请，消费满额赠送商品',
  updated_at = NOW()
WHERE code = 'promotion_fullgift';

COMMIT;
