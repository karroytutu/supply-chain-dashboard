-- 070: ERP 库存快照表
-- 替代原 xinshutong 数据库的 "实时库存表_每天" 表
-- 数据通过 ERP API 每日定时拉取，存入应用数据库

CREATE TABLE IF NOT EXISTS erp_inventory_snapshots (
  id SERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  goods_id INTEGER NOT NULL,
  goods_name TEXT NOT NULL,
  available_base_quantity NUMERIC NOT NULL DEFAULT 0,
  base_cost_price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(snapshot_date, goods_id)
);

-- 按日期查询索引（月度趋势查询常用）
CREATE INDEX IF NOT EXISTS idx_snapshots_date ON erp_inventory_snapshots(snapshot_date);

-- 按商品名称查询索引（战略商品齐全率查询常用）
CREATE INDEX IF NOT EXISTS idx_snapshots_goods_name ON erp_inventory_snapshots(goods_name);

COMMENT ON TABLE erp_inventory_snapshots IS '每日库存快照，数据来源于 ERP 实时库存 API，替代原 xinshutong.实时库存表_每天';
COMMENT ON COLUMN erp_inventory_snapshots.snapshot_date IS '快照日期';
COMMENT ON COLUMN erp_inventory_snapshots.goods_id IS 'ERP 商品 ID';
COMMENT ON COLUMN erp_inventory_snapshots.goods_name IS '商品名称';
COMMENT ON COLUMN erp_inventory_snapshots.available_base_quantity IS '可用库存数量（基本单位）';
COMMENT ON COLUMN erp_inventory_snapshots.base_cost_price IS '加权平均成本价';
