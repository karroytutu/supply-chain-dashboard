-- =====================================================
-- 122: oa_approval_actions 表添加 round 列
-- depends_on: 121
-- =====================================================
-- 背景：
--   会签计数查询（approve-approval.ts）需要按轮次过滤 approve
--   操作记录，但 oa_approval_actions 表此前无 round 列，导致退回
--   后重新审批时历史轮次的 approve 记录被累计计入，会签可能
--   提前通过。
--
-- 本脚本：
--   - 新增 round 列（INTEGER，默认 1）
--   - 回填历史数据：根据 action_at 与节点 created_at 的关系
--     推断所属轮次
--   - 添加复合索引加速按轮次查询
-- =====================================================

BEGIN;

-- 步骤 1: 新增 round 列
ALTER TABLE oa_approval_actions ADD COLUMN round INTEGER DEFAULT 1;

-- 步骤 2: 回填历史数据
-- 对每条 action，找到同 instance_id + node_order 下、
-- created_at <= action_at 的节点中 round 最大的那条，取其 round
UPDATE oa_approval_actions a
SET round = COALESCE(
  (SELECT MAX(n.round) FROM oa_approval_nodes n
   WHERE n.instance_id = a.instance_id
     AND n.node_order = a.node_order
     AND n.created_at <= a.action_at),
  1
);

-- 步骤 3: 添加复合索引支持按轮次过滤
CREATE INDEX idx_oa_actions_instance_node_round
  ON oa_approval_actions(instance_id, node_order, round);

COMMIT;
