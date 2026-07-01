-- 目标管理模块：数据库表结构 + 权限迁移
-- 每个营销师每月一条目标记录，明细按客户-品类-商品三级存储

-- 目标主表（每个营销师每月一条记录）
CREATE TABLE IF NOT EXISTS sales_targets (
  id SERIAL PRIMARY KEY,
  marketer_id INTEGER NOT NULL REFERENCES users(id),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(marketer_id, year, month)
);

-- 目标明细（客户-品类-商品 三级）
CREATE TABLE IF NOT EXISTS sales_target_items (
  id SERIAL PRIMARY KEY,
  target_id INTEGER NOT NULL REFERENCES sales_targets(id) ON DELETE CASCADE,
  erp_consumer_id INTEGER,
  consumer_name VARCHAR(200) NOT NULL,
  is_planned_new BOOLEAN DEFAULT FALSE,
  erp_goods_id INTEGER,
  goods_name VARCHAR(200) NOT NULL,
  category_name VARCHAR(200),
  unit VARCHAR(50),
  unit_price DECIMAL(12,2),
  target_amount DECIMAL(12,2) DEFAULT 0,
  remark TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_targets_marketer ON sales_targets(marketer_id);
CREATE INDEX IF NOT EXISTS idx_sales_target_items_target ON sales_target_items(target_id);
CREATE INDEX IF NOT EXISTS idx_sales_target_items_consumer ON sales_target_items(erp_consumer_id);

-- 权限迁移：为 marketer 角色分配只读权限
-- （sales:target:read 和 sales:target:write 已在 149 号迁移中创建，
--  149 号迁移已为 admin + marketing_manager 分配了 read + write，
--  此处补充 marketer 的 read 权限）
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'marketer' AND p.code = 'sales:target:read'
ON CONFLICT DO NOTHING;
