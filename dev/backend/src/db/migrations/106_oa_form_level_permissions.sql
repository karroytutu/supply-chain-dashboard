-- 106: OA 表单级别权限控制
-- 背景：oa:write 权限粒度太粗，无法控制"谁能发起哪种表单"
-- 方案：新增 allowed_roles 字段实现表单级发起控制，删除 oa:write 权限

BEGIN;

-- =====================================================
-- 1. 确保 manager 角色存在（迁移 011 中删除但后续流程仍引用）
-- =====================================================
INSERT INTO roles (code, name, description, is_system, status)
VALUES ('manager', '供应链经理', '供应链管理岗位', true, 1)
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- 2. oa_form_types 新增 allowed_roles 字段
-- =====================================================
ALTER TABLE oa_form_types
  ADD COLUMN IF NOT EXISTS allowed_roles TEXT[] DEFAULT NULL;

COMMENT ON COLUMN oa_form_types.allowed_roles IS
  '允许发起此表单的角色编码列表。NULL 表示不限制（所有 OA 用户均可发起），空数组表示禁用。';

-- =====================================================
-- 3. 为现有表单类型设置初始 allowed_roles
-- =====================================================
UPDATE oa_form_types SET allowed_roles = '{admin,manager,current_accountant,operations_manager}'
  WHERE code = 'other_payment';

UPDATE oa_form_types SET allowed_roles = '{admin,manager,admin_staff,operations_manager}'
  WHERE code = 'asset_purchase';

UPDATE oa_form_types SET allowed_roles = '{admin,admin_staff,warehouse_manager,operations_manager}'
  WHERE code = 'asset_transfer';

UPDATE oa_form_types SET allowed_roles = '{admin,admin_staff,operations_manager}'
  WHERE code = 'asset_maintenance';

UPDATE oa_form_types SET allowed_roles = '{admin,manager,admin_staff}'
  WHERE code = 'asset_disposal';

UPDATE oa_form_types SET allowed_roles = '{admin,manager,marketing_manager,marketer,current_accountant}'
  WHERE code = 'customer_credit';

UPDATE oa_form_types SET allowed_roles = '{admin,manager,operations_manager,marketing_manager,procurement_manager,warehouse_manager}'
  WHERE code = 'assessment_appeal';

UPDATE oa_form_types SET allowed_roles = '{admin,marketing_manager,marketer,current_accountant}'
  WHERE code = 'customer_modify';

UPDATE oa_form_types SET allowed_roles = '{admin,manager,marketing_manager,marketer}'
  WHERE code = 'ar_collection';

UPDATE oa_form_types SET allowed_roles = '{admin,manager,procurement_manager,operations_manager,admin_staff}'
  WHERE code = 'procurement_order';

-- =====================================================
-- 4. 删除 oa:write 权限记录
--    role_permissions 通过 permission_id 外键 ON DELETE CASCADE 自动级联清理
-- =====================================================
DELETE FROM permissions WHERE code = 'oa:write';

-- =====================================================
-- 5. 新增"表单管理"权限，分配给 admin
-- =====================================================
INSERT INTO permissions (code, name, resource_type, resource_key, action)
VALUES ('oa:form:manage', '表单管理', 'api', '/api/oa/admin/form-types', 'write')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'admin' AND p.code = 'oa:form:manage'
ON CONFLICT DO NOTHING;

-- =====================================================
-- 6. 更新 oa:read 权限名称（语义调整：查看OA → 访问OA系统）
-- =====================================================
UPDATE permissions SET name = '访问OA系统' WHERE code = 'oa:read';

COMMIT;
