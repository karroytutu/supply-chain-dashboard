-- 补充营销师、营销主管的 OA 审批查看权限
-- 背景：043_add_general_manager_role.sql 只为 marketer/marketing_manager 分配了 oa:approval:write
-- 但遗漏了 oa:approval:read，导致这两个角色无法进入"发起审批"页面和"审批中心"
-- 前端路由和后端 API 均要求 oa:approval:read 才能访问

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('marketer', 'marketing_manager')
  AND p.code = 'oa:approval:read'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
