-- 173: 供应商承担功能 - 更新表单版本号和描述
-- form_schema 和 workflow_def 由代码定义，此迁移仅更新元数据
-- =====================================================

-- 市场费用申请
UPDATE oa_form_types
SET version = 3,
    description = '申请市场费用（陈列费、临期处理费等），审批通过后自动创建ERP兑付协议，支持供应商承担'
WHERE code = 'market_expense';

-- 线下组合搭赠促销
UPDATE oa_form_types
SET version = 3,
    description = '线下组合搭赠促销活动申请，支持供应商承担'
WHERE code = 'promotion_combined_offline';

-- 线下限时特价促销
UPDATE oa_form_types
SET version = 3,
    description = '线下限时特价促销活动申请，支持供应商承担'
WHERE code = 'promotion_special_offline';

-- 线下满赠促销
UPDATE oa_form_types
SET version = 3,
    description = '线下满赠促销活动申请，支持供应商承担'
WHERE code = 'promotion_fullgift_offline';
