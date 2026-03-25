-- 战略商品管理功能数据库迁移
-- 数据库: xly_dashboard

-- 战略商品表
CREATE TABLE IF NOT EXISTS strategic_products (
  id SERIAL PRIMARY KEY,
  goods_id VARCHAR(64) NOT NULL UNIQUE,        -- 商品ID（关联商品档案.goodsId）
  goods_name VARCHAR(200),                      -- 商品名称（冗余字段）
  category_path VARCHAR(500),                   -- 品类路径（格式：一级/二级/三级）
  status VARCHAR(20) DEFAULT 'pending',         -- 状态: pending/confirmed/rejected
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- 确认字段
  procurement_confirmed BOOLEAN DEFAULT FALSE,
  procurement_confirmed_by INTEGER REFERENCES users(id),
  procurement_confirmed_at TIMESTAMP,
  marketing_confirmed BOOLEAN DEFAULT FALSE,
  marketing_confirmed_by INTEGER REFERENCES users(id),
  marketing_confirmed_at TIMESTAMP,
  confirmed_at TIMESTAMP                        -- 双方都确认后的生效时间
);

-- 索引
CREATE INDEX idx_strategic_products_status ON strategic_products(status);
CREATE INDEX idx_strategic_products_goods_id ON strategic_products(goods_id);
CREATE INDEX idx_strategic_products_category_path ON strategic_products(category_path);
CREATE INDEX idx_strategic_products_confirmed ON strategic_products(confirmed_at) 
  WHERE confirmed_at IS NOT NULL;

-- 为表添加更新时间触发器
DROP TRIGGER IF EXISTS update_strategic_products_updated_at ON strategic_products;
CREATE TRIGGER update_strategic_products_updated_at
    BEFORE UPDATE ON strategic_products
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 新增角色
INSERT INTO roles (code, name, description, is_system) VALUES
  ('procurement_manager', '采购主管', '负责战略商品采购端确认', TRUE),
  ('marketing_manager', '营销主管', '负责战略商品营销端确认', TRUE)
ON CONFLICT (code) DO NOTHING;

-- 新增权限
INSERT INTO permissions (code, name, resource_type, resource_key, action, sort_order) VALUES
  ('strategic:read', '查看战略商品', 'menu', '/strategic-products', 'read', 50),
  ('strategic:write', '编辑战略商品', 'api', '/api/strategic-products', 'write', 51),
  ('strategic:confirm:procurement', '采购确认', 'api', '/api/strategic-products/confirm', 'write', 52),
  ('strategic:confirm:marketing', '营销确认', 'api', '/api/strategic-products/confirm', 'write', 53)
ON CONFLICT (code) DO NOTHING;

-- 为角色分配权限
-- 采购主管：查看 + 采购确认
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  (SELECT id FROM roles WHERE code = 'procurement_manager'), 
  id
FROM permissions 
WHERE code IN ('strategic:read', 'strategic:confirm:procurement')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- 营销主管：查看 + 营销确认
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  (SELECT id FROM roles WHERE code = 'marketing_manager'), 
  id
FROM permissions 
WHERE code IN ('strategic:read', 'strategic:confirm:marketing')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- admin拥有所有新权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE code LIKE 'strategic:%'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- manager角色拥有查看和编辑权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT 
  (SELECT id FROM roles WHERE code = 'manager'), 
  id
FROM permissions 
WHERE code IN ('strategic:read', 'strategic:write')
ON CONFLICT (role_id, permission_id) DO NOTHING;
