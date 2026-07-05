-- 目标管理模块索引优化

-- 删除 176 迁移中创建的旧索引（已被下方新索引替代）
DROP INDEX IF EXISTS idx_erp_sales_consumer_goods_time;

-- 毛利率查询优化：settle_time + business_attr 过滤后按 consumer_id, goods_id 聚合
-- 替代原 idx_erp_sales_consumer_goods_time (consumer_id, goods_id, settle_time)
CREATE INDEX IF NOT EXISTS idx_erp_sales_time_biz_consumer_goods
  ON erp_sales_details(settle_time, business_attr, consumer_id, goods_id);

-- listTargets 复合索引优化：覆盖 marketer_id + year + month 常用查询模式
CREATE INDEX IF NOT EXISTS idx_sales_targets_marketer_year_month
  ON sales_targets(marketer_id, year, month);

-- 清理被新复合索引覆盖的旧单列索引，减少存储和写入开销
DROP INDEX IF EXISTS idx_sales_target_items_target;
DROP INDEX IF EXISTS idx_sales_targets_marketer;

-- DOWN: 回滚逻辑
-- DROP INDEX IF EXISTS idx_erp_sales_time_biz_consumer_goods;
-- DROP INDEX IF EXISTS idx_sales_targets_marketer_year_month;
