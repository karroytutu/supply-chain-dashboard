-- =====================================================
-- 141: OA 表单类型新增用户级权限字段
-- 与现有角色级字段（allowed_roles 等）并行，支持选择具体人员
-- =====================================================

ALTER TABLE oa_form_types ADD COLUMN IF NOT EXISTS allowed_users INTEGER[] DEFAULT NULL;
ALTER TABLE oa_form_types ADD COLUMN IF NOT EXISTS data_read_users INTEGER[] DEFAULT NULL;
ALTER TABLE oa_form_types ADD COLUMN IF NOT EXISTS data_export_users INTEGER[] DEFAULT NULL;

COMMENT ON COLUMN oa_form_types.allowed_users IS '允许发起此表单的用户ID列表，NULL表示不限制（与allowed_roles并行）';
COMMENT ON COLUMN oa_form_types.data_read_users IS '可查看此表单数据的用户ID列表，NULL表示不限制（与data_read_roles并行）';
COMMENT ON COLUMN oa_form_types.data_export_users IS '可导出此表单数据的用户ID列表，NULL表示不限制（与data_export_roles并行）';
