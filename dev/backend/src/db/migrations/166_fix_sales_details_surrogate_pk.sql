-- 166: erp_sales_details 改用代理主键
-- ERP API 返回的销售明细存在完全重复行（biz_str + goods_id 相同），
-- 与 erp_batch_inventory 相同原因，改用 serial 代理主键。

-- 清空表（sync engine 会重新填充）
DELETE FROM erp_sales_details;

-- 删除旧主键约束
ALTER TABLE erp_sales_details DROP CONSTRAINT IF EXISTS erp_sales_details_pkey;

-- 添加 serial 代理主键
ALTER TABLE erp_sales_details ADD COLUMN IF NOT EXISTS id SERIAL;
UPDATE erp_sales_details SET id = DEFAULT WHERE id IS NULL;
ALTER TABLE erp_sales_details ADD PRIMARY KEY (id);

-- 自然键降级为普通索引
CREATE INDEX IF NOT EXISTS idx_sales_details_natural_key
  ON erp_sales_details (biz_str, goods_id);
