-- 042: 恢复 ar:collection:verify 权限
-- 原因: 039 迁移删除了该权限，但 confirm-verify 路由现在需要检查此权限
-- 结算会计(cashier)角色需要此权限才能执行核销确认和驳回操作

-- 恢复权限记录
INSERT INTO permissions (code, name, resource_type, resource_key, action)
VALUES
  ('ar:collection:verify', '核销确认', 'api', '/api/ar-collection/confirm-verify', 'verify')
ON CONFLICT (code) DO NOTHING;

-- 为 cashier(结算会计)角色重新分配该权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'cashier'
  AND p.code = 'ar:collection:verify'
ON CONFLICT DO NOTHING;

-- 同时确保 admin 也有此权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'admin'
  AND p.code = 'ar:collection:verify'
ON CONFLICT DO NOTHING;
