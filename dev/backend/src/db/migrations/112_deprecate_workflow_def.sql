-- =====================================================
-- 112: workflow_def 改为代码唯一来源
--
-- 变更内容：
-- 1. 清空 oa_form_types.workflow_def 列（保留列结构，数据由代码定义提供）
-- 2. 处理在途 v5 采购审批实例：将 pending 状态的 order=7（办结检查）节点标记为 skipped
--
-- 背景：
-- workflow_def 已改为代码唯一来源（与 form_schema 一致），
-- DB 列保留但不再作为运行时主源。
-- 此前迁移 111 是注释性迁移，未实际更新数据库，
-- 导致 oa_form_types 仍存储旧版流程定义。
--
-- 兼容性：
-- - 在途审批实例的节点已快照到 oa_approval_nodes 表，不受此迁移影响
-- - v4 旧版在途实例的 order=10（办结检查）不受影响（仅处理 v5 的 order=7）
-- - 已完成的审批实例不受影响
-- =====================================================

-- 1. 清空所有表单的 workflow_def（代码为唯一来源）
UPDATE oa_form_types
SET workflow_def = '{}'::jsonb
WHERE workflow_def IS NOT NULL
  AND workflow_def != '{}'::jsonb;

-- 2. 处理在途 v5 采购审批实例中卡在 order=7（办结检查）的 pending 节点
UPDATE oa_approval_nodes
SET status = 'skipped',
    acted_at = NOW(),
    comment = COALESCE(comment, '') || ' [系统] 办结检查节点已移除，自动跳过',
    updated_at = NOW()
WHERE instance_id IN (
    SELECT i.id
    FROM oa_approval_instances i
    JOIN oa_form_types ft ON ft.id = i.form_type_id
    WHERE ft.code = 'procurement_order'
      AND i.status = 'pending'
)
AND node_order = 7
AND node_name = '办结检查'
AND status = 'pending';
