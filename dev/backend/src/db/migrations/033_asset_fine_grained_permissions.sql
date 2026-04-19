-- 固定资产细粒度权限迁移
-- 将原来的 asset:write 拆分为 purchase/transfer/maintenance/disposal 四个子权限
-- 保留 asset:write 作为总开关（向下兼容），新增子权限用于页面级控制

-- =====================================================
-- 1. 新增细粒度权限定义
-- =====================================================
INSERT INTO permissions (code, name, resource_type, resource_key, action) VALUES
    ('asset:purchase:write', '采购申请', 'menu', '/asset/purchase', 'write'),
    ('asset:transfer:write', '领用调拨申请', 'menu', '/asset/transfer', 'write'),
    ('asset:maintenance:write', '维修申请', 'menu', '/asset/maintenance', 'write'),
    ('asset:disposal:write', '清理申请', 'menu', '/asset/disposal', 'write')
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- 2. 更新已有权限名称（更精确）
-- =====================================================
UPDATE permissions SET name = '查看资产（总开关）' WHERE code = 'asset:read';
UPDATE permissions SET name = '提交资产申请（总开关）' WHERE code = 'asset:write';

-- =====================================================
-- 3. 为已有角色分配细粒度权限
-- =====================================================

-- admin: 全部子权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'admin'
AND p.code IN ('asset:purchase:write', 'asset:transfer:write', 'asset:maintenance:write', 'asset:disposal:write')
ON CONFLICT DO NOTHING;

-- operations_manager: 全部子权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'operations_manager'
AND p.code IN ('asset:purchase:write', 'asset:transfer:write', 'asset:maintenance:write', 'asset:disposal:write')
ON CONFLICT DO NOTHING;

-- admin_staff: 采购+领用+维修（不含清理，清理需管理员）
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'admin_staff'
AND p.code IN ('asset:purchase:write', 'asset:transfer:write', 'asset:maintenance:write')
ON CONFLICT DO NOTHING;

-- warehouse_keeper / warehouse_manager: 领用调拨
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('warehouse_keeper', 'warehouse_manager')
AND p.code IN ('asset:transfer:write')
ON CONFLICT DO NOTHING;

-- cashier: 无需子权限（出纳只做数据录入节点，使用 asset:data_input 即可）

-- =====================================================
-- 4. 确保函数存在（幂等检查）
-- =====================================================
-- 检查 generate_asset_application_no 函数是否存在，不存在则创建
-- 使用 CREATE OR REPLACE 保证幂等
CREATE OR REPLACE FUNCTION generate_asset_application_no()
RETURNS VARCHAR AS $$
DECLARE
    seq_num INTEGER;
    date_prefix VARCHAR(8);
    result VARCHAR(64);
BEGIN
    date_prefix := TO_CHAR(NOW(), 'YYYYMMDD');
    seq_num := nextval('asset_application_no_seq');
    result := 'APA' || date_prefix || LPAD(seq_num::TEXT, 4, '0');
    RETURN result;
END;
$$ LANGUAGE plpgsql;
