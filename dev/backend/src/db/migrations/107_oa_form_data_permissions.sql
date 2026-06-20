-- 107: OA 数据权限表单级管理
-- 背景：oa:data:read 和 oa:data:export 是系统级权限，现改为按表单类型精细控制
-- 方案：新增 data_read_roles 和 data_export_roles 字段，删除系统级权限

BEGIN;

-- =====================================================
-- 1. oa_form_types 新增数据权限字段
-- =====================================================
ALTER TABLE oa_form_types
  ADD COLUMN IF NOT EXISTS data_read_roles TEXT[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS data_export_roles TEXT[] DEFAULT NULL;

COMMENT ON COLUMN oa_form_types.data_read_roles IS
  '可查看该表单审批数据的角色编码列表。NULL 表示不限制。';
COMMENT ON COLUMN oa_form_types.data_export_roles IS
  '可导出该表单审批数据的角色编码列表。NULL 表示不限制。';

-- =====================================================
-- 2. 为现有表单填充初始值
--    data_read_roles: admin + manager + general_manager（与原 oa:data:read 分配一致）
--    data_export_roles: admin + manager（与原 oa:data:export 分配一致）
-- =====================================================
UPDATE oa_form_types
SET data_read_roles = '{admin,manager,general_manager}',
    data_export_roles = '{admin,manager}';

-- =====================================================
-- 3. 删除系统级数据权限（ON DELETE CASCADE 自动清理 role_permissions）
-- =====================================================
DELETE FROM permissions WHERE code = 'oa:data:read';
DELETE FROM permissions WHERE code = 'oa:data:export';

COMMIT;
