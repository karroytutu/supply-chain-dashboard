-- =====================================================
-- 120: OA 流程引擎架构优化 —— 按需触发节点创建 + 多人签署单记录
-- depends_on: 119
-- =====================================================
-- 背景：
--   1. 系统存在两套矛盾的节点创建模型（预创建 vs 按需创建），
--      导致 skipped 状态语义混乱（"还没轮到" vs "被跳过"）
--   2. 多人签署（或签/会签）为每人创建独立行，违反"一个环节一条记录"原则
--
-- 本脚本：
--   - 新增 assigned_user_ids 数组列，替代 assigned_user_id 单值列
--   - 合并多人签署多行为单行
--   - 删除所有 skipped 状态节点行
--   - 删除在途催收实例中预创建的 pending auto 节点
--   - 移除旧列，恢复 UNIQUE(instance_id, node_order) 约束
-- =====================================================

BEGIN;

-- =====================================================
-- 步骤 1: 新增 assigned_user_ids 列
-- =====================================================
ALTER TABLE oa_approval_nodes ADD COLUMN assigned_user_ids INTEGER[] DEFAULT NULL;

-- 将现有 assigned_user_id 填充到 assigned_user_ids
UPDATE oa_approval_nodes
SET assigned_user_ids = ARRAY[assigned_user_id]
WHERE assigned_user_id IS NOT NULL;

-- =====================================================
-- 步骤 2: 多人签署合并（同一 instance_id + node_order 的多行合并为单行）
-- =====================================================
-- 2a. 创建临时表存储聚合结果
CREATE TEMP TABLE _merged_sign_nodes AS
SELECT
  instance_id,
  node_order,
  array_agg(assigned_user_id ORDER BY id) FILTER (WHERE assigned_user_id IS NOT NULL) AS merged_user_ids,
  string_agg(assigned_user_name, ', ' ORDER BY id) FILTER (WHERE assigned_user_name IS NOT NULL) AS merged_user_names,
  MIN(id) AS keep_id
FROM oa_approval_nodes
WHERE sign_mode IS NOT NULL
GROUP BY instance_id, node_order
HAVING COUNT(*) > 1;

-- 2b. 更新保留行的 assigned_user_ids 和 assigned_user_name
UPDATE oa_approval_nodes n
SET assigned_user_ids = m.merged_user_ids,
    assigned_user_name = m.merged_user_names
FROM _merged_sign_nodes m
WHERE n.id = m.keep_id;

-- 2c. 将被合并行的 actions 重新关联到保留行（按 node_order 关联的不受影响，但有按 node id 关联的情况）
-- 注意：oa_approval_actions 通过 (instance_id, node_order) 关联，不通过 node id，所以无需更新 actions

-- 2d. 处理 countersign 外键引用（如果有指向被删除行的 FK）
UPDATE oa_approval_nodes n
SET countersign_parent_node_id = m.keep_id
FROM _merged_sign_nodes m
WHERE n.countersign_parent_node_id IN (
  SELECT id FROM oa_approval_nodes
  WHERE sign_mode IS NOT NULL
    AND id != m.keep_id
    AND instance_id = m.instance_id
    AND node_order = m.node_order
);

-- 2e. 删除冗余行（仅限多人签署分组中的非保留行）
DELETE FROM oa_approval_nodes n
USING _merged_sign_nodes m
WHERE n.instance_id = m.instance_id
  AND n.node_order = m.node_order
  AND n.id != m.keep_id;

DROP TABLE _merged_sign_nodes;

-- =====================================================
-- 步骤 3: 删除所有 skipped 状态的节点行
-- =====================================================
DELETE FROM oa_approval_nodes WHERE status = 'skipped';

-- =====================================================
-- 步骤 3.5: 删除在途催收实例中预创建的 pending auto 节点
-- =====================================================
-- 这些节点是旧模型预创建的，新模型下应由 evaluateAndTriggerNodes 按需创建
DELETE FROM oa_approval_nodes n
USING oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE n.instance_id = i.id
  AND ft.code = 'ar_collection'
  AND i.status IN ('pending', 'processing')
  AND n.node_type = 'auto'
  AND n.status = 'pending';

-- =====================================================
-- 步骤 4: 移除旧列和旧外键
-- =====================================================
-- 先移除外键约束
ALTER TABLE oa_approval_nodes DROP CONSTRAINT IF EXISTS oa_approval_nodes_assigned_user_id_fkey;

-- 移除旧列
ALTER TABLE oa_approval_nodes DROP COLUMN assigned_user_id;
ALTER TABLE oa_approval_nodes DROP COLUMN assigned_user_name;

-- =====================================================
-- 步骤 5: 清理旧索引 + 恢复 UNIQUE 约束
-- =====================================================
DROP INDEX IF EXISTS idx_oa_nodes_assigned;
DROP INDEX IF EXISTS idx_oa_nodes_sign_query;
DROP INDEX IF EXISTS idx_oa_nodes_instance_order;

-- 恢复 UNIQUE(instance_id, node_order) 约束
CREATE UNIQUE INDEX idx_oa_nodes_instance_order_unique
  ON oa_approval_nodes(instance_id, node_order);

-- =====================================================
-- 步骤 6: 新增索引
-- =====================================================
-- GIN 索引（支持 $1 = ANY(assigned_user_ids) 查询）
CREATE INDEX idx_oa_nodes_user_ids ON oa_approval_nodes
  USING GIN(assigned_user_ids) WHERE assigned_user_ids IS NOT NULL;

COMMIT;
