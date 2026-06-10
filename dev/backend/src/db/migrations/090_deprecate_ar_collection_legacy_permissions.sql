-- 090: 删除旧催收模块废弃权限
-- 旧催收 REST API 路由已全部删除，催收流程已迁移至 OA 流程引擎
-- 以下权限对应的 API 已不存在，后端代码中零引用：
-- - ar:collection:write: 旧催收写操作（migration 022 创建）
-- - ar:collection:verify: 旧手动核销确认（migration 042 恢复，039 曾删除）
-- - ar:collection:rollback: 旧催收退回（migration 056 创建）
-- 注意: ar:collection:read 保留，仍被 workspace.service.ts 用于工作台权限门控

BEGIN;

-- 先删除角色-权限关联
DELETE FROM role_permissions WHERE permission_id IN (
  SELECT id FROM permissions WHERE code IN (
    'ar:collection:write',
    'ar:collection:verify',
    'ar:collection:rollback'
  )
);

-- 再删除权限记录
DELETE FROM permissions WHERE code IN (
  'ar:collection:write',
  'ar:collection:verify',
  'ar:collection:rollback'
);

COMMIT;
