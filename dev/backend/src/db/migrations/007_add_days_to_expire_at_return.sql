-- 添加退货时剩余保质期字段
-- 数据库: xly_dashboard

-- ============================================
-- 添加 days_to_expire_at_return 字段
-- 用于记录退货时的剩余保质期天数（静态历史数据）
-- days_to_expire 字段将改为动态计算当前剩余保质期
-- ============================================

ALTER TABLE expiring_return_orders 
ADD COLUMN IF NOT EXISTS days_to_expire_at_return INTEGER;

-- 添加注释说明
COMMENT ON COLUMN expiring_return_orders.days_to_expire_at_return IS '退货时剩余保质期天数（静态历史记录）';
COMMENT ON COLUMN expiring_return_orders.days_to_expire IS '当前剩余保质期天数（动态计算）';

-- 迁移现有数据：将 days_to_expire 的值复制到新字段
UPDATE expiring_return_orders 
SET days_to_expire_at_return = days_to_expire 
WHERE days_to_expire IS NOT NULL 
  AND days_to_expire_at_return IS NULL;

-- 对于 days_to_expire 为 NULL 的记录，根据 batch_date 和 shelf_life 计算退货时剩余保质期
-- 使用 return_date 作为退货时间点
UPDATE expiring_return_orders 
SET days_to_expire_at_return = GREATEST(0, EXTRACT(DAY FROM (batch_date + shelf_life * INTERVAL '1 day') - return_date)::int)
WHERE days_to_expire_at_return IS NULL 
  AND batch_date IS NOT NULL 
  AND shelf_life IS NOT NULL 
  AND return_date IS NOT NULL;

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_expiring_return_orders_days_to_expire_at_return 
ON expiring_return_orders(days_to_expire_at_return);
