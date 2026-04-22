-- 038: 新增战略商品导出权限
-- 前端 StrategicProductTable 组件已使用 PERMISSIONS.STRATEGIC.EXPORT，
-- 但数据库中无此权限记录，导致前端权限检查无法通过

INSERT INTO permissions (code, name, resource_type, resource_key, action)
VALUES ('strategic:export', '导出战略商品', 'api', '/api/strategic-products/export', 'export')
ON CONFLICT (code) DO NOTHING;

-- 为 admin 角色分配导出权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'admin' AND p.code = 'strategic:export'
ON CONFLICT DO NOTHING;

-- 为 manager 角色分配导出权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'manager' AND p.code = 'strategic:export'
ON CONFLICT DO NOTHING;
