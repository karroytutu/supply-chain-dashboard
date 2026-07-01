-- 164: 修复 erp_batch_inventory 主键
-- 原主键 (goods_id, warehouse_id, product_date, expire_date, quality_type) 不够精确
-- 同一商品+仓库+生产日期+到期日+品质 可能有多个批次（stock_lot_str 不同）
-- 修复：加入 stock_lot_str 使主键真正唯一

-- 先清空表中可能因主键冲突导致重复写入的数据
DELETE FROM erp_batch_inventory;

-- 删除旧主键约束
ALTER TABLE erp_batch_inventory DROP CONSTRAINT IF EXISTS erp_batch_inventory_pkey;

-- 添加新主键约束（包含 stock_lot_str）
ALTER TABLE erp_batch_inventory ADD PRIMARY KEY (goods_id, warehouse_id, product_date, expire_date, quality_type, stock_lot_str);
