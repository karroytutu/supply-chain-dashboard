-- 新增查看权限配置列
-- 非当前办理人查看详情时使用，结构与 field_permissions 对称
-- NULL = 默认全部隐藏（最安全的兜底行为）

ALTER TABLE oa_form_types
ADD COLUMN IF NOT EXISTS view_permissions JSONB DEFAULT NULL;

COMMENT ON COLUMN oa_form_types.view_permissions IS
'查看权限配置（非办理人查看详情时使用）：{nodes: {order: {field: readonly|hidden}}}，NULL=默认全部隐藏';
