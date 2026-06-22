-- =====================================================
-- 121: OA 节点多轮执行支持（退回后流程重走）
-- depends_on: 120
-- =====================================================
-- 背景：
--   迁移 120 将多人签署合并为单行后，添加了 UNIQUE(instance_id, node_order)
--   约束，导致同一环节只能有一行记录。但退回后流程重新前进时，需要为同
--   一环节创建新的执行记录（参照 Camunda/飞书/钉钉最佳实践）。
--
-- 本脚本：
--   - 移除 UNIQUE(instance_id, node_order) 约束
--   - 新增 round 列（INTEGER，默认 1），标识每个环节的第几轮执行
--   - 已有数据全部填充 round = 1
-- =====================================================

BEGIN;

-- 步骤 1: 移除 UNIQUE 约束（迁移 120 步骤 5 创建的）
DROP INDEX IF EXISTS idx_oa_nodes_instance_order_unique;

-- 步骤 2: 新增 round 列
ALTER TABLE oa_approval_nodes ADD COLUMN round INTEGER NOT NULL DEFAULT 1;

-- 步骤 3: 为已执行的历史实例回填 round = 1（DEFAULT 已自动填充，此步骤为显式确认）
UPDATE oa_approval_nodes SET round = 1 WHERE round IS NULL;

-- 步骤 4: 添加复合索引支持"按实例+环节+轮次"查询
CREATE INDEX idx_oa_nodes_instance_order_round
  ON oa_approval_nodes(instance_id, node_order, round DESC);

COMMIT;
