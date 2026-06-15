-- =====================================================
-- 迁移 098 回滚脚本：恢复被修复的审批单原始状态
--
-- 使用前提：098_fix_premature_auto_nodes.sql 已执行，且备份表仍存在
-- 注意：执行回滚后应删除备份表
-- =====================================================

BEGIN;

-- Step 1: 从备份恢复 auto 节点状态
UPDATE oa_approval_nodes n
SET status = b.status,
    acted_at = b.acted_at,
    comment = b.comment,
    updated_at = b.updated_at
FROM _backup_098_affected_nodes b
WHERE n.id = b.id
  AND n.node_type = 'auto';

-- Step 2: 从备份恢复审批实例状态
UPDATE oa_approval_instances i
SET status = b.status,
    current_node_order = b.current_node_order,
    erp_meta = b.erp_meta,
    updated_at = b.updated_at
FROM _backup_098_affected_instances b
WHERE i.id = b.id;

-- Step 3: 删除修复操作记录
DELETE FROM oa_approval_actions
WHERE action_type = 'data_fix'
  AND comment = '数据修复(098): 回退被定时任务提前执行的自动环节';

-- Step 4: 清理备份表
DROP TABLE IF EXISTS _backup_098_affected_nodes;
DROP TABLE IF EXISTS _backup_098_affected_instances;

COMMIT;
