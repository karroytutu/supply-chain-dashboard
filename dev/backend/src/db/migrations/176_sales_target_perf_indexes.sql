-- 目标管理模块性能优化索引

-- 概览/历史服务核心查询：settle_time + business_attr 过滤
CREATE INDEX IF NOT EXISTS idx_erp_sales_settle_biz
  ON erp_sales_details(settle_time, business_attr);

-- 毛利率查询：consumer_id + goods_id + settle_time 聚合
CREATE INDEX IF NOT EXISTS idx_erp_sales_consumer_goods_time
  ON erp_sales_details(consumer_id, goods_id, settle_time);

-- 目标明细复合索引（替代单列 target_id 索引，覆盖排序需求）
CREATE INDEX IF NOT EXISTS idx_sales_target_items_target_sort
  ON sales_target_items(target_id, consumer_name, category_name, goods_name);

-- sales_targets 按 year+month 查询（listTargets 常用）
CREATE INDEX IF NOT EXISTS idx_sales_targets_year_month
  ON sales_targets(year, month);

-- DOWN: 回滚逻辑
-- DROP INDEX IF EXISTS idx_erp_sales_settle_biz;
-- DROP INDEX IF EXISTS idx_erp_sales_consumer_goods_time;
-- DROP INDEX IF EXISTS idx_sales_target_items_target_sort;
-- DROP INDEX IF EXISTS idx_sales_targets_year_month;
