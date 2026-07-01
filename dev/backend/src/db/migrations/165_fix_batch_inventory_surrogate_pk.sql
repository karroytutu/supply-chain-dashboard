-- 165: erp_batch_inventory 改用代理主键
-- ERP API 返回的批次数据存在完全重复行（stock_lot_str 全为空字符串），
-- 自然键 (goods_id, warehouse_id, product_date, expire_date, quality_type, stock_lot_str)
-- 无法唯一标识行。改用 serial 代理主键，自然键降级为普通索引。

-- 清空表（数据会由 sync engine 重新填充）
DELETE FROM erp_batch_inventory;

-- 删除旧的自然键主键约束
ALTER TABLE erp_batch_inventory DROP CONSTRAINT IF EXISTS erp_batch_inventory_pkey;

-- 添加 serial 代理主键
ALTER TABLE erp_batch_inventory ADD COLUMN IF NOT EXISTS id SERIAL;
UPDATE erp_batch_inventory SET id = DEFAULT WHERE id IS NULL;
ALTER TABLE erp_batch_inventory ADD PRIMARY KEY (id);

-- 自然键降级为普通索引（用于业务查询）
CREATE INDEX IF NOT EXISTS idx_batch_inv_natural_key
  ON erp_batch_inventory (goods_id, warehouse_id, product_date, expire_date, quality_type);

-- 允许 product_date 和 expire_date 为 NULL（ERP 数据中存在空字符串）
ALTER TABLE erp_batch_inventory ALTER COLUMN product_date DROP NOT NULL;
ALTER TABLE erp_batch_inventory ALTER COLUMN expire_date DROP NOT NULL;
