-- 163: ERP 数据本地化同步表
-- 将 6 个 ERP 数据集从内存缓存迁移到 PostgreSQL 本地表
-- 包含: 5 张 Type A 状态快照表 + 1 张 Type B 流水窗口表 + 4 张 Type C 派生表 + 2 张状态/日志表

-- ============================================================
-- Type A: 状态快照表（每 2 分钟全量 UPSERT）
-- 统一设计: 核心业务字段(独立列) + raw_data(JSONB) + content_hash + synced_at
-- ============================================================

-- 1. erp_debts: 客户欠款明细
CREATE TABLE IF NOT EXISTS erp_debts (
  bill_id TEXT PRIMARY KEY,
  biz_str TEXT,
  biz_order_str TEXT,
  consumer_name TEXT NOT NULL,
  consumer_code TEXT,
  trader_id INTEGER,
  settler_id INTEGER,
  settler_name TEXT,
  manager_users TEXT,
  total_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  left_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  settle_method INTEGER,
  consumer_expire_day INTEGER,
  bill_type TEXT,
  bill_type_name TEXT,
  work_time TEXT,
  hoard_tag TEXT,
  collect_state TEXT,
  settlement_state TEXT,
  write_off_amount NUMERIC(18,4) DEFAULT 0,
  pre_pay_amount NUMERIC(18,4) DEFAULT 0,
  dept_name TEXT,
  salesman_name TEXT,
  bill_note TEXT,
  is_hoard TEXT,
  uuid TEXT,
  raw_data JSONB,
  content_hash TEXT,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. erp_products: 商品档案
CREATE TABLE IF NOT EXISTS erp_products (
  goods_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  category_id INTEGER,
  category_chain TEXT,
  category_chain_name TEXT,
  brand_id INTEGER,
  brand_name TEXT,
  state INTEGER,
  base_unit_name TEXT,
  pkg_unit_name TEXT,
  mid_unit_name TEXT,
  unit_factor NUMERIC,
  mid_unit_factor NUMERIC,
  shelf_life INTEGER,
  shelf_life_type INTEGER,
  warn_days INTEGER,
  specifications TEXT,
  article_number TEXT,
  base_wholesale NUMERIC(18,4),
  mid_wholesale NUMERIC(18,4),
  pkg_wholesale NUMERIC(18,4),
  base_purchase NUMERIC(18,4),
  mid_purchase NUMERIC(18,4),
  pkg_purchase NUMERIC(18,4),
  base_cheapest NUMERIC(18,4),
  mid_cheapest NUMERIC(18,4),
  pkg_cheapest NUMERIC(18,4),
  base_barcode TEXT,
  pkg_barcode TEXT,
  mid_barcode TEXT,
  base_weight NUMERIC,
  base_volume NUMERIC,
  unit_factor_name TEXT,
  raw_data JSONB,
  content_hash TEXT,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. erp_inventory: 实时库存（仓库级粒度）
CREATE TABLE IF NOT EXISTS erp_inventory (
  goods_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  quality_type TEXT NOT NULL DEFAULT 'GOOD',
  goods_name TEXT NOT NULL,
  short_name TEXT,
  available_base_quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
  available_pkg_quantity NUMERIC(18,4) DEFAULT 0,
  base_cost_price NUMERIC(18,4) DEFAULT 0,
  pkg_cost_price NUMERIC(18,4) DEFAULT 0,
  base_wholesale NUMERIC(18,4) DEFAULT 0,
  pkg_wholesale NUMERIC(18,4) DEFAULT 0,
  warehouse_name TEXT,
  type_chain_name TEXT,
  type_name_level1 TEXT,
  type_name_level2 TEXT,
  type_name_level3 TEXT,
  physical_base_quantity NUMERIC(18,4) DEFAULT 0,
  physical_pkg_quantity NUMERIC(18,4) DEFAULT 0,
  locked_base_quantity NUMERIC(18,4) DEFAULT 0,
  locked_pkg_quantity NUMERIC(18,4) DEFAULT 0,
  base_unit_name TEXT,
  brand_id INTEGER,
  brand_name TEXT,
  category_name TEXT,
  state INTEGER,
  physical_cost_amount NUMERIC(18,4) DEFAULT 0,
  available_cost_amount NUMERIC(18,4) DEFAULT 0,
  raw_data JSONB,
  content_hash TEXT,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (goods_id, warehouse_id, quality_type)
);

-- 4. erp_batch_inventory: 批次库存（保质期粒度）
CREATE TABLE IF NOT EXISTS erp_batch_inventory (
  goods_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  product_date DATE NOT NULL,
  expire_date DATE NOT NULL,
  quality_type TEXT NOT NULL DEFAULT 'GOOD',
  goods_name TEXT NOT NULL,
  unit_name TEXT,
  unit_factor_name TEXT,
  days_to_expire INTEGER,
  days_from_product INTEGER,
  shelf_life INTEGER,
  quality_type_str TEXT,
  convert_base_quantity NUMERIC(18,4) DEFAULT 0,
  convert_base_available_quantity NUMERIC(18,4) DEFAULT 0,
  quantity TEXT,
  available_quantity TEXT,
  category_id INTEGER,
  category_name TEXT,
  brand_id INTEGER,
  brand_name TEXT,
  warehouse_name TEXT,
  volume NUMERIC,
  weight NUMERIC,
  alarm_percent NUMERIC,
  is_alarm INTEGER DEFAULT 0,
  is_expire INTEGER DEFAULT 0,
  stock_lot_str TEXT,
  raw_data JSONB,
  content_hash TEXT,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (goods_id, warehouse_id, product_date, expire_date, quality_type)
);

-- 5. erp_customers: 客户档案
CREATE TABLE IF NOT EXISTS erp_customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  consumer_code TEXT,
  contact_name TEXT,
  contact_tel TEXT,
  state INTEGER,
  doc_state INTEGER,
  area_id INTEGER,
  area_name TEXT,
  group_id INTEGER,
  group_name TEXT,
  consumer_manager_id INTEGER,
  consumer_manager_name TEXT,
  settle_consumer_id INTEGER,
  settle_consumer_name TEXT,
  max_debt_days INTEGER,
  max_debt_order_num INTEGER,
  max_debt_amount NUMERIC(18,4),
  settle_method INTEGER,
  debt_amount NUMERIC(18,4) DEFAULT 0,
  address TEXT,
  province TEXT,
  city TEXT,
  district TEXT,
  grade_id INTEGER,
  grade_name TEXT,
  cooperation_type_name TEXT,
  scan_full_pay INTEGER,
  auto_write_off INTEGER DEFAULT 0,
  picture TEXT,
  attached_pic_urls TEXT,
  raw_data JSONB,
  content_hash TEXT,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Type B: 流水窗口表（滑动窗口分频同步）
-- ============================================================

-- 6. erp_sales_details: 销售结算明细
CREATE TABLE IF NOT EXISTS erp_sales_details (
  biz_str TEXT NOT NULL,
  goods_id INTEGER NOT NULL,
  goods_name TEXT NOT NULL,
  base_quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
  actual_quantity NUMERIC DEFAULT 0,
  settle_time TEXT,
  consumer_name TEXT,
  consumer_id INTEGER,
  consumer_code TEXT,
  settle_consumer_id INTEGER,
  settle_consumer_name TEXT,
  origin_str TEXT,
  salesman_id INTEGER,
  salesman_name TEXT,
  dept_id INTEGER,
  dept_name TEXT,
  deliver_id INTEGER,
  deliver_name TEXT,
  warehouse_id INTEGER,
  warehouse_name TEXT,
  quality_type TEXT,
  quality_type_name TEXT,
  business_attr TEXT,
  business_attr_name TEXT,
  settle_method TEXT,
  settle_method_name TEXT,
  finance_cost_price NUMERIC(18,4) DEFAULT 0,
  finance_cost_amount NUMERIC(18,4) DEFAULT 0,
  finance_sales_amount NUMERIC(18,4) DEFAULT 0,
  finance_profit NUMERIC(18,4) DEFAULT 0,
  finance_profit_rate TEXT,
  sign_amount NUMERIC(18,4) DEFAULT 0,
  base_unit_name TEXT,
  pkg_unit_name TEXT,
  mid_unit_name TEXT,
  category_id INTEGER,
  category_name TEXT,
  brand_id INTEGER,
  brand_name TEXT,
  area_id INTEGER,
  area_name TEXT,
  group_id INTEGER,
  group_name TEXT,
  grade_id INTEGER,
  grade_name TEXT,
  sub_type TEXT,
  order_link_type TEXT,
  bill_from TEXT,
  specifications TEXT,
  barcode TEXT,
  goods_code TEXT,
  goods_unit_factor_name TEXT,
  tag_id INTEGER,
  tag_name TEXT,
  wholesale_price NUMERIC(18,4) DEFAULT 0,
  wholesale_amount NUMERIC(18,4) DEFAULT 0,
  order_time TEXT,
  raw_data JSONB,
  content_hash TEXT,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (biz_str, goods_id)
);

-- ============================================================
-- Type C: 派生表（从 Type A/B 表计算得出）
-- ============================================================

-- 7. erp_debt_changes: 欠款变更日志（changelog diff）
CREATE TABLE IF NOT EXISTS erp_debt_changes (
  id SERIAL PRIMARY KEY,
  dataset_id TEXT NOT NULL DEFAULT 'debts',
  entity_key TEXT NOT NULL,
  change_type TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. erp_debt_daily_summary: 欠款每日汇总（按客户聚合）
CREATE TABLE IF NOT EXISTS erp_debt_daily_summary (
  id SERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  consumer_name TEXT NOT NULL,
  total_debt NUMERIC(18,4) NOT NULL DEFAULT 0,
  bill_count INTEGER NOT NULL DEFAULT 0,
  max_overdue_days INTEGER DEFAULT 0,
  UNIQUE(snapshot_date, consumer_name)
);

-- 9. erp_daily_sales_summary: 销售每日汇总（按商品聚合）
CREATE TABLE IF NOT EXISTS erp_daily_sales_summary (
  id SERIAL PRIMARY KEY,
  sale_date DATE NOT NULL,
  goods_name TEXT NOT NULL,
  goods_id INTEGER,
  total_quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  last_settle_time TEXT,
  category_name TEXT,
  brand_name TEXT,
  UNIQUE(sale_date, goods_name)
);

-- 10. erp_inventory_snapshots_v2: 库存每日快照（升级版，替代 070 的 erp_inventory_snapshots）
CREATE TABLE IF NOT EXISTS erp_inventory_snapshots_v2 (
  id SERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  goods_id INTEGER NOT NULL,
  warehouse_id INTEGER NOT NULL,
  goods_name TEXT NOT NULL,
  available_base_quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
  base_cost_price NUMERIC(18,4) DEFAULT 0,
  warehouse_name TEXT,
  type_chain_name TEXT,
  quality_type TEXT DEFAULT 'GOOD',
  brand_name TEXT,
  UNIQUE(snapshot_date, goods_id, warehouse_id, quality_type)
);

-- ============================================================
-- 同步状态 + 日志表
-- ============================================================

-- 11. erp_sync_status: 同步状态（每个数据源一行）
CREATE TABLE IF NOT EXISTS erp_sync_status (
  source_id TEXT PRIMARY KEY,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  last_success_at TIMESTAMP WITH TIME ZONE,
  last_duration_ms INTEGER,
  total_records INTEGER DEFAULT 0,
  consecutive_failures INTEGER DEFAULT 0,
  total_syncs INTEGER DEFAULT 0,
  total_failures INTEGER DEFAULT 0,
  circuit_state TEXT DEFAULT 'closed',
  circuit_opened_at TIMESTAMP WITH TIME ZONE,
  last_error_message TEXT
);

-- 12. erp_sync_log: 同步日志（每次同步一条记录）
CREATE TABLE IF NOT EXISTS erp_sync_log (
  id SERIAL PRIMARY KEY,
  source_id TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  duration_ms INTEGER,
  status TEXT NOT NULL,
  records_fetched INTEGER DEFAULT 0,
  records_upserted INTEGER DEFAULT 0,
  records_changed INTEGER DEFAULT 0,
  error_message TEXT
);

-- ============================================================
-- 索引
-- ============================================================

-- erp_debts 索引
CREATE INDEX IF NOT EXISTS idx_erp_debts_consumer ON erp_debts(consumer_name);
CREATE INDEX IF NOT EXISTS idx_erp_debts_work_time ON erp_debts(work_time);
CREATE INDEX IF NOT EXISTS idx_erp_debts_left_amount ON erp_debts(left_amount) WHERE left_amount > 0;

-- erp_products 索引
CREATE INDEX IF NOT EXISTS idx_erp_products_name ON erp_products(name);
CREATE INDEX IF NOT EXISTS idx_erp_products_category ON erp_products(category_chain_name);

-- erp_inventory 索引
CREATE INDEX IF NOT EXISTS idx_erp_inventory_goods_name ON erp_inventory(goods_name);

-- erp_batch_inventory 索引
CREATE INDEX IF NOT EXISTS idx_erp_batch_goods_name ON erp_batch_inventory(goods_name);
CREATE INDEX IF NOT EXISTS idx_erp_batch_expire ON erp_batch_inventory(expire_date);

-- erp_customers 索引
CREATE INDEX IF NOT EXISTS idx_erp_customers_name ON erp_customers(name);

-- erp_sales_details 索引
CREATE INDEX IF NOT EXISTS idx_erp_sales_settle_time ON erp_sales_details(settle_time);
CREATE INDEX IF NOT EXISTS idx_erp_sales_goods_name ON erp_sales_details(goods_name);
CREATE INDEX IF NOT EXISTS idx_erp_sales_goods_time ON erp_sales_details(goods_name, settle_time);
CREATE INDEX IF NOT EXISTS idx_erp_sales_consumer ON erp_sales_details(consumer_name);

-- erp_debt_changes 索引
CREATE INDEX IF NOT EXISTS idx_debt_changes_entity ON erp_debt_changes(entity_key);
CREATE INDEX IF NOT EXISTS idx_debt_changes_detected ON erp_debt_changes(detected_at);

-- erp_debt_daily_summary 索引
CREATE INDEX IF NOT EXISTS idx_debt_daily_date ON erp_debt_daily_summary(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_debt_daily_consumer ON erp_debt_daily_summary(consumer_name);

-- erp_daily_sales_summary 索引
CREATE INDEX IF NOT EXISTS idx_sales_daily_date ON erp_daily_sales_summary(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_daily_goods ON erp_daily_sales_summary(goods_name);

-- erp_inventory_snapshots_v2 索引
CREATE INDEX IF NOT EXISTS idx_inv_snap_v2_date ON erp_inventory_snapshots_v2(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_inv_snap_v2_goods ON erp_inventory_snapshots_v2(goods_name);
CREATE INDEX IF NOT EXISTS idx_inv_snap_v2_goods_date ON erp_inventory_snapshots_v2(goods_id, snapshot_date);

-- erp_sync_log 索引
CREATE INDEX IF NOT EXISTS idx_sync_log_source ON erp_sync_log(source_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_started ON erp_sync_log(started_at);

-- ============================================================
-- 旧表标记 deprecated
-- ============================================================
COMMENT ON TABLE erp_inventory_snapshots IS '[DEPRECATED] 已被 erp_inventory_snapshots_v2 替代。保留历史数据，新查询请走 v2 表。';

-- ============================================================
-- 初始化同步状态（6 个数据源）
-- ============================================================
INSERT INTO erp_sync_status (source_id) VALUES
  ('debts'),
  ('products'),
  ('inventory'),
  ('batch_inventory'),
  ('customers'),
  ('sales')
ON CONFLICT (source_id) DO NOTHING;

-- ============================================================
-- 权限注册（ERP 数据同步管理页面）
-- ============================================================

-- 查看同步状态和日志
INSERT INTO permissions (code, name, resource_type, resource_key, action)
VALUES ('system:erp-sync:read', '查看ERP数据同步', 'menu', '/system/erp-sync', 'read')
ON CONFLICT (code) DO NOTHING;

-- 强制同步和重置熔断器
INSERT INTO permissions (code, name, resource_type, resource_key, action)
VALUES ('system:erp-sync:write', '管理ERP数据同步', 'api', '/api/erp-sync', 'write')
ON CONFLICT (code) DO NOTHING;

-- 为管理员分配权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('admin')
  AND p.code IN ('system:erp-sync:read', 'system:erp-sync:write')
ON CONFLICT DO NOTHING;
