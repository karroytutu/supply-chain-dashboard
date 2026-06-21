-- =====================================================
-- 113: 新增字段权限 DB 覆盖配置列
-- 用途：管理员可通过表单管理页面配置每个环节的字段可见/可编辑/隐藏
-- 结构：{ initiation: {field: perm}, nodes: {order: {field: perm}} }
-- =====================================================

ALTER TABLE oa_form_types
ADD COLUMN IF NOT EXISTS field_permissions JSONB DEFAULT NULL;

COMMENT ON COLUMN oa_form_types.field_permissions IS
'字段权限 DB 覆盖配置：{initiation: {field: perm}, nodes: {order: {field: perm}}}';

-- 采购审批：发起阶段隐藏出纳专属字段（实付金额、付款账户、付款回单）
UPDATE oa_form_types
SET field_permissions = '{
  "initiation": {
    "paymentAmount": "hidden",
    "paymentSubjectId": "hidden",
    "paymentReceiptUrls": "hidden"
  }
}'::jsonb
WHERE code = 'procurement_order';
