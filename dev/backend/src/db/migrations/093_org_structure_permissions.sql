-- 组织架构模块权限
-- 数据库: xly_dashboard

-- 新增"查看组织架构"权限
INSERT INTO permissions (code, name, resource_type, resource_key, action, sort_order)
VALUES ('system:org:read', '查看组织架构', 'menu', '/system/org-structure', 'read', 135)
ON CONFLICT (code) DO NOTHING;

-- 仅 admin 和 manager 可查看（operator 暂不开放，避免全员隐私暴露风险）
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('admin', 'manager') AND p.code = 'system:org:read'
ON CONFLICT DO NOTHING;