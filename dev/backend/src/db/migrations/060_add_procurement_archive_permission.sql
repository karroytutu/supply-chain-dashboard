-- 补充采购绩效存档查看权限
-- 确保分配权限页中可找到该权限
INSERT INTO permissions (code, name, resource_type, resource_key, action, sort_order)
VALUES ('procurement:archive:read', '查看采购绩效存档', 'api', '/api/procurement/archive', 'read', 310)
ON CONFLICT (code) DO NOTHING;

-- 为管理员、供应链经理、采购主管分配该权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code IN ('admin', 'manager', 'procurement_manager')
  AND p.code = 'procurement:archive:read'
ON CONFLICT DO NOTHING;
