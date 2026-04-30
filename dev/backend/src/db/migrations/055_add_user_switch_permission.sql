-- 055: 新增用户切换权限 system:user:switch
-- 生产环境需要此权限才能使用切换用户功能
-- 开发环境不受此权限限制（仅需登录）

-- 新增权限编码
INSERT INTO permissions (code, name, resource_type, resource_key, action)
VALUES ('system:user:switch', '切换用户', 'api', '/api/auth/dev-switch', 'switch')
ON CONFLICT (code) DO NOTHING;

-- 为 admin 角色分配此权限（管理员默认拥有所有权限）
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'admin' AND p.code = 'system:user:switch'
ON CONFLICT DO NOTHING;

-- 创建专用角色（项目无 user_permissions 表，权限必须通过角色分配）
INSERT INTO roles (code, name, description, is_system, status)
VALUES ('user_switch', '用户切换', '允许在生产环境切换用户身份', FALSE, 1)
ON CONFLICT (code) DO NOTHING;

-- 为 user_switch 角色分配切换权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'user_switch' AND p.code = 'system:user:switch'
ON CONFLICT DO NOTHING;

-- 为"文昌盛"用户分配 user_switch 角色
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u, roles r
WHERE u.name = '文昌盛' AND r.code = 'user_switch'
ON CONFLICT DO NOTHING;
