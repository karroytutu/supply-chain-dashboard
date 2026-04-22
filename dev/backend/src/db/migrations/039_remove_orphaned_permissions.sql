-- 039: 删除孤立权限
-- 以下权限在数据库中存在但有角色分配，但后端路由从未使用 requirePermission 检查：
-- - ar:collection:verify: 后端对 verify 操作使用 ar:collection:write，此权限从未被检查
-- - ar:collection:escalate: 后端对 escalate 操作使用 ar:collection:write，此权限从未被检查
-- - dashboard:export:write: 后端无导出路由，前端无组件使用
-- - system:user:delete: 后端无删除用户路由

-- 先删除角色-权限关联
DELETE FROM role_permissions WHERE permission_id IN (
  SELECT id FROM permissions WHERE code IN (
    'ar:collection:verify',
    'ar:collection:escalate',
    'dashboard:export:write',
    'system:user:delete'
  )
);

-- 再删除权限记录
DELETE FROM permissions WHERE code IN (
  'ar:collection:verify',
  'ar:collection:escalate',
  'dashboard:export:write',
  'system:user:delete'
);
