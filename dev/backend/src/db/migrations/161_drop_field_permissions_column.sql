-- 161: 删除 field_permissions 列
-- 字段权限已固化到代码中（各 form-types/*.ts 的 fieldPermissions 属性），
-- DB 列不再使用，物理删除。

ALTER TABLE oa_form_types DROP COLUMN IF EXISTS field_permissions;
