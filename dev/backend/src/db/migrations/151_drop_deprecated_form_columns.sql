-- =====================================================
-- 151: 删除废弃的 form_schema 和 workflow_def 列
--
-- 背景：
-- - form_schema 已被迁移 110 标记废弃，列值为空 {"fields":[]}
-- - workflow_def 已被迁移 112 清空为 {}
-- - 两个列的值均由代码定义提供（form-types/*.ts），DB 不再参与运行时逻辑
--
-- 影响：
-- - 在途审批实例不受影响（节点已快照到 oa_approval_nodes 表）
-- - 历史审批实例不受影响（form_data 存的是提交数据，不是 schema）
-- =====================================================

-- 删除 form_schema 列（迁移 110 已废弃）
ALTER TABLE oa_form_types DROP COLUMN IF EXISTS form_schema;

-- 删除 workflow_def 列（迁移 112 已废弃）
ALTER TABLE oa_form_types DROP COLUMN IF EXISTS workflow_def;
