-- 目标管理模块权限注册
-- 用于营销师目标制定、审批、跟踪的全流程

-- 查看目标（含目标列表、目标进展看板）
INSERT INTO permissions (code, name, resource_type, resource_key, action)
VALUES ('sales:target:read', '查看目标管理', 'menu', '/sales/targets', 'read')
ON CONFLICT (code) DO NOTHING;

-- 编辑目标（含保存草稿、提交审批、通过/驳回）
INSERT INTO permissions (code, name, resource_type, resource_key, action)
VALUES ('sales:target:write', '编辑目标管理', 'api', '/api/sales/targets', 'write')
ON CONFLICT (code) DO NOTHING;

-- 为管理员和营销主管分配权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('admin', 'marketing_manager')
  AND p.code IN ('sales:target:read', 'sales:target:write')
ON CONFLICT DO NOTHING;
