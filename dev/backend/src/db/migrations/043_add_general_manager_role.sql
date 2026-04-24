-- 新增总经理角色
-- 客户授信申请审批流的最终审批节点
INSERT INTO roles (code, name, description, is_system, status)
VALUES ('general_manager', '总经理', '公司总经理，负责最终审批决策', true, 1)
ON CONFLICT (code) DO NOTHING;

-- 授予总经理 OA 审批读写权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'general_manager'
  AND p.code IN ('oa:approval:read', 'oa:approval:write', 'oa:data:read')
ON CONFLICT DO NOTHING;

-- 授予营销师、营销主管、往来会计 OA 审批写权限（如尚未有）
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('marketer', 'marketing_manager', 'current_accountant')
  AND p.code = 'oa:approval:write'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
