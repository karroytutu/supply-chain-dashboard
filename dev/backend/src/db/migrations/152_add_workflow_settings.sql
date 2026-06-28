-- =====================================================
-- 152: 新增 workflow_settings 列
--
-- 背景：
-- 审批流程配置拆分为两部分：
-- - 节点结构（节点数量、顺序、类型、条件）：由代码定义，不存数据库
-- - 管理配置（审批人规则、签署模式、超时时限）：由管理员在表单配置页面编辑，存数据库
--
-- workflow_settings 仅存储管理员可编辑的配置，按节点 order 索引
-- =====================================================

ALTER TABLE oa_form_types ADD COLUMN IF NOT EXISTS workflow_settings JSONB DEFAULT '{}';
COMMENT ON COLUMN oa_form_types.workflow_settings IS '管理员在表单配置页面保存的流程管理配置（审批人规则、签署模式、超时时限），与代码定义的节点结构分离';
