-- 新增营销师角色并分配催收权限
-- 问题背景：
--   - 011_role_adjustments.sql 删除了 operator 角色
--   - 022_ar_collection.sql 给已删除的 operator 分配权限无效
--   - 导致营销师用户无法访问逾期催收管理页
-- 修复方案：
--   1. 新增 marketer（营销师）角色
--   2. 分配催收权限（read + write + escalate）
--   3. 同时为 marketing_manager 补充分配催收权限

BEGIN;

-- ============================================
-- 1. 新增营销师角色
-- ============================================
INSERT INTO roles (code, name, description, is_system) VALUES
  ('marketer', '营销师', '负责客户催收跟进、核销申请、延期申请、升级处理', TRUE)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- 2. 为营销师分配催收权限
-- ============================================
-- marketer: read + write + escalate（查看、催收操作、升级处理）
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'marketer'
  AND p.code IN ('ar:collection:read', 'ar:collection:write', 'ar:collection:escalate')
ON CONFLICT DO NOTHING;

-- ============================================
-- 3. 确保 marketing_manager 有催收权限
-- （营销主管角色，由 marketing_supervisor 合并而来）
-- ============================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'marketing_manager'
  AND p.code IN ('ar:collection:read', 'ar:collection:write', 'ar:collection:escalate')
ON CONFLICT DO NOTHING;

-- ============================================
-- 4. 确保 current_accountant（往来会计）有催收权限
-- （继承自已删除的 finance_staff）
-- ============================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'current_accountant'
  AND p.code IN ('ar:collection:read', 'ar:collection:write')
ON CONFLICT DO NOTHING;

-- ============================================
-- 5. 确保 operations_manager（运营支持中心经理）有催收权限
-- ============================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'operations_manager'
  AND p.code IN ('ar:collection:read', 'ar:collection:write', 'ar:collection:escalate')
ON CONFLICT DO NOTHING;

COMMIT;
