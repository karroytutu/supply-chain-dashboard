-- 采购绩效月度存档表
-- 用于保存战略商品齐全率和库存周转天数的月度数据，支持绩效考核
CREATE TABLE IF NOT EXISTS procurement_monthly_archive (
  id SERIAL PRIMARY KEY,
  archive_month DATE NOT NULL,

  -- 战略商品齐全率指标
  strategic_availability_rate DECIMAL(5,2),
  strategic_total_sku INTEGER,
  strategic_days_in_month INTEGER,

  -- 库存周转天数指标
  turnover_days INTEGER,
  turnover_previous_days INTEGER,
  turnover_trend DECIMAL(5,2),

  -- 元数据
  archived_at TIMESTAMP DEFAULT NOW(),
  archived_by VARCHAR(50) DEFAULT 'scheduler',

  CONSTRAINT uk_procurement_archive_month UNIQUE (archive_month)
);

-- 创建月份索引，加速按月份查询
CREATE INDEX IF NOT EXISTS idx_procurement_archive_month
  ON procurement_monthly_archive(archive_month DESC);

-- 添加注释
COMMENT ON TABLE procurement_monthly_archive IS '采购绩效月度存档表，用于绩效考核';
COMMENT ON COLUMN procurement_monthly_archive.archive_month IS '存档月份（月份第一天）';
COMMENT ON COLUMN procurement_monthly_archive.strategic_availability_rate IS '战略商品月度平均齐全率(%)';
COMMENT ON COLUMN procurement_monthly_archive.strategic_total_sku IS '战略商品总数';
COMMENT ON COLUMN procurement_monthly_archive.strategic_days_in_month IS '统计天数';
COMMENT ON COLUMN procurement_monthly_archive.turnover_days IS '库存周转天数';
COMMENT ON COLUMN procurement_monthly_archive.turnover_previous_days IS '上月库存周转天数';
COMMENT ON COLUMN procurement_monthly_archive.turnover_trend IS '周转天数环比变化(%)';
COMMENT ON COLUMN procurement_monthly_archive.archived_at IS '存档时间';
COMMENT ON COLUMN procurement_monthly_archive.archived_by IS '存档方式(scheduler/manual)';

-- 新增权限
INSERT INTO permissions (code, name, resource_type, resource_key, action, sort_order)
VALUES ('procurement:archive:read', '查看采购绩效存档', 'api', '/api/procurement/archive', 'read', 310)
ON CONFLICT (code) DO NOTHING;

-- 为管理员角色分配权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE code = 'procurement:archive:read'
ON CONFLICT DO NOTHING;
