-- 角色系统调整迁移
-- 1. 新增角色：运营支持中心经理、往来会计
-- 2. cashier 改名为结算会计
-- 3. 合并营销主管（marketing_supervisor → marketing_manager）
-- 4. 往来会计继承 finance_staff 权限
-- 5. 删除 manager、operator、finance_staff、marketing_supervisor

BEGIN;

-- 1. 新增角色
INSERT INTO roles (code, name, description, is_system) VALUES
  ('operations_manager', '运营支持中心经理', '负责运营支持中心的管理工作', TRUE),
  ('current_accountant', '往来会计', '负责应收应付账款的记录和管理', TRUE)
ON CONFLICT (code) DO NOTHING;

-- 2. cashier 改名
UPDATE roles SET name = '结算会计', description = '负责回款结算确认' WHERE code = 'cashier';

-- 3. 合并营销主管：将 marketing_supervisor 的权限合并到 marketing_manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'marketing_manager'), rp.permission_id
FROM role_permissions rp
WHERE rp.role_id = (SELECT id FROM roles WHERE code = 'marketing_supervisor')
ON CONFLICT DO NOTHING;

-- 4. 为往来会计分配 finance_staff 的权限（替代其催收流程职责）
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'current_accountant'), rp.permission_id
FROM role_permissions rp
WHERE rp.role_id = (SELECT id FROM roles WHERE code = 'finance_staff')
ON CONFLICT DO NOTHING;

-- 5. 清理待删除角色的 user_roles 关联
DELETE FROM user_roles WHERE role_id IN (SELECT id FROM roles WHERE code IN ('manager', 'operator', 'finance_staff', 'marketing_supervisor'));

-- 6. 清理待删除角色的 role_permissions 关联
DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE code IN ('manager', 'operator', 'finance_staff', 'marketing_supervisor'));

-- 7. 删除角色
DELETE FROM roles WHERE code IN ('manager', 'operator', 'finance_staff', 'marketing_supervisor');

COMMIT;
