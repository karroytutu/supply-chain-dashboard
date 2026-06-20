-- 108: 岗位权限体系统一修复
-- 背景：角色编码散落导致审批流程断裂和职责错位
-- 修复：finance_staff→current_accountant、admin→general_manager(总经理审批)、
--       manager→department_manager(重命名)、warehouse_keeper→warehouse_operator(合并)

BEGIN;

-- ============================================
-- 前置检查：确保 general_manager 角色下有活跃用户
-- ============================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE r.code = 'general_manager' AND r.status = 1
  ) THEN
    RAISE EXCEPTION 'general_manager 角色下无活跃用户，请先在用户管理中为总经理岗位分配用户';
  END IF;
END $$;

-- ============================================
-- Part 1: manager → department_manager 重命名
-- ============================================

-- 创建新岗位
INSERT INTO roles (code, name, description, is_system, status)
VALUES ('department_manager', '部门经理', '部门级管理岗位，负责部门内审批和表单发起', true, 1)
ON CONFLICT (code) DO NOTHING;

-- 迁移用户关联
INSERT INTO user_roles (user_id, role_id)
SELECT ur.user_id, (SELECT id FROM roles WHERE code = 'department_manager')
FROM user_roles ur JOIN roles r ON r.id = ur.role_id
WHERE r.code = 'manager'
ON CONFLICT DO NOTHING;

-- 迁移角色权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'department_manager'), rp.permission_id
FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
WHERE r.code = 'manager'
ON CONFLICT DO NOTHING;

-- 更新表单发起权限中的 manager → department_manager
UPDATE oa_form_types
SET allowed_roles = array_replace(allowed_roles, 'manager', 'department_manager')
WHERE allowed_roles IS NOT NULL AND 'manager' = ANY(allowed_roles);

-- 停用旧 manager 岗位
UPDATE roles SET status = 0, description = '已停用，由 department_manager 替代'
WHERE code = 'manager';

-- ============================================
-- Part 2: 修复 other_payment workflow_def
-- (finance_staff → current_accountant + admin → general_manager)
-- ============================================
UPDATE oa_form_types
SET workflow_def = replace(
      replace(workflow_def::text, 'finance_staff', 'current_accountant'),
      '"roleCode":"admin"', '"roleCode":"general_manager"'
    )::jsonb,
    version = 2,
    updated_at = NOW()
WHERE code = 'other_payment';

-- ============================================
-- Part 3: 修复其他 4 个表单的"总经理审批"节点
-- admin → general_manager
-- ============================================
UPDATE oa_form_types
SET workflow_def = replace(workflow_def::text,
      '"roleCode":"admin"', '"roleCode":"general_manager"')::jsonb,
    version = CASE code
      WHEN 'asset_purchase' THEN 3
      WHEN 'asset_maintenance' THEN 3
      WHEN 'asset_disposal' THEN 3
      WHEN 'procurement_order' THEN 2
      ELSE version + 1
    END,
    updated_at = NOW()
WHERE code IN ('asset_purchase', 'asset_maintenance', 'asset_disposal', 'procurement_order');

-- ============================================
-- Part 4: warehouse_keeper → warehouse_operator 合并
-- ============================================

-- 迁移用户关联
INSERT INTO user_roles (user_id, role_id)
SELECT ur.user_id, (SELECT id FROM roles WHERE code = 'warehouse_operator')
FROM user_roles ur JOIN roles r ON r.id = ur.role_id
WHERE r.code = 'warehouse_keeper'
ON CONFLICT DO NOTHING;

-- 迁移角色权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'warehouse_operator'), rp.permission_id
FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
WHERE r.code = 'warehouse_keeper'
ON CONFLICT DO NOTHING;

-- 停用旧 warehouse_keeper 岗位
UPDATE roles SET status = 0, description = '已停用，由 warehouse_operator 替代'
WHERE code = 'warehouse_keeper';

-- ============================================
-- Part 5: 修复进行中的审批实例（仅 pending 节点）
-- ============================================

-- 修复 finance_staff → current_accountant 的待处理节点
UPDATE oa_approval_nodes n SET role_code = 'current_accountant'
FROM oa_approval_instances i
WHERE n.instance_id = i.id
  AND n.role_code = 'finance_staff'
  AND n.status = 'pending'
  AND i.status = 'pending';

-- 修复 admin → general_manager 的待处理"总经理审批"节点
UPDATE oa_approval_nodes n SET role_code = 'general_manager'
FROM oa_approval_instances i
WHERE n.instance_id = i.id
  AND n.role_code = 'admin'
  AND n.status = 'pending'
  AND i.status = 'pending'
  AND n.node_name LIKE '%总经理%';

-- 重新分配待处理节点的审批人（将原 admin 的节点改分配给 general_manager 角色用户）
-- 注意：仅修改 assigned_user_id 为 admin 角色用户的节点
UPDATE oa_approval_nodes n
SET assigned_user_id = (
  SELECT ur.user_id FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  WHERE r.code = 'general_manager' AND r.status = 1
  LIMIT 1
)
FROM oa_approval_instances i
WHERE n.instance_id = i.id
  AND n.role_code = 'general_manager'
  AND n.status = 'pending'
  AND i.status = 'pending'
  AND n.assigned_user_id IN (
    SELECT ur2.user_id FROM user_roles ur2
    JOIN roles r2 ON r2.id = ur2.role_id
    WHERE r2.code = 'admin'
  );

-- ============================================
-- Part 6: 补齐前后端不一致的权限编码
-- ============================================

-- 这些权限在路由中使用但未在任何迁移脚本中定义
INSERT INTO permissions (code, name, resource_type, resource_key, action)
VALUES
  ('return:read', '查看退货单', 'menu', '/return-orders', 'read'),
  ('return:write', '编辑退货单', 'api', '/api/return-orders', 'write'),
  ('goods-rules:read', '查看退货规则', 'menu', '/goods-return-rules', 'read'),
  ('goods-rules:write', '编辑退货规则', 'api', '/api/goods-return-rules', 'write')
ON CONFLICT (code) DO NOTHING;

-- 为 admin 分配这些权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'admin'
  AND p.code IN ('return:read', 'return:write', 'goods-rules:read', 'goods-rules:write')
ON CONFLICT DO NOTHING;

COMMIT;
