-- 新增客户授信权限
INSERT INTO permissions (code, name, resource_type, resource_key, action)
VALUES
  ('finance:credit:read', '查看客户授信', 'api', '/oa-approval/form-types/customer_credit', 'read'),
  ('finance:credit:write', '提交客户授信申请', 'api', '/oa-approval/instances', 'write')
ON CONFLICT (code) DO NOTHING;

-- 授予可提交角色的读写权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('admin', 'general_manager', 'marketing_manager', 'current_accountant', 'marketer')
  AND p.code IN ('finance:credit:read', 'finance:credit:write')
ON CONFLICT DO NOTHING;

-- viewer 和 cashier 只读
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('viewer', 'cashier')
  AND p.code = 'finance:credit:read'
ON CONFLICT DO NOTHING;
