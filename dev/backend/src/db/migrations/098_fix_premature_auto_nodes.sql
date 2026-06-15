-- =====================================================
-- 迁移 098: 数据修复 — 系统自动环节提前执行
--
-- 背景：recoverStuckAutoNodes 定时恢复任务误判，将正在等待人工审批的审批单
--   当成"卡住"的审批单，强行执行了自动环节（如"更新ERP客户授信"、"更新催收状态"）。
--   导致自动环节被标记为 approved，但人工环节仍为 pending。
--   影响 577 个审批单（ar_collection 568 + customer_credit 9）。
--
-- 修复内容：
--   1. 回退自动环节状态：approved → pending
--   2. 重置 erp_meta 状态：清除 status、requestLog、responseData
--   3. 校正 current_node_order 指向第一个 pending 人工环节
-- =====================================================

BEGIN;

-- Step 0: 清理可能残留的旧备份表（如上次迁移失败后残留），确保备份表使用最新数据
DROP TABLE IF EXISTS _backup_098_affected_nodes;
DROP TABLE IF EXISTS _backup_098_affected_instances;

-- Step 1: 创建备份表（保留至少 30 天，用于审计和回滚）
CREATE TABLE IF NOT EXISTS _backup_098_affected_instances AS
SELECT i.id, i.status, i.current_node_order, i.erp_meta, i.updated_at
FROM oa_approval_instances i
WHERE i.status = 'pending'
  AND EXISTS (
    SELECT 1 FROM oa_approval_nodes n
    WHERE n.instance_id = i.id AND n.node_type = 'auto' AND n.status = 'approved'
  )
  AND EXISTS (
    SELECT 1 FROM oa_approval_nodes n
    WHERE n.instance_id = i.id AND n.node_type != 'auto' AND n.status IN ('pending', 'processing')
  );

CREATE TABLE IF NOT EXISTS _backup_098_affected_nodes AS
SELECT n.* FROM oa_approval_nodes n
WHERE n.instance_id IN (SELECT id FROM _backup_098_affected_instances);

-- Step 2: 回退自动环节状态 approved → pending，清除 acted_at 和 comment
UPDATE oa_approval_nodes
SET status = 'pending',
    acted_at = NULL,
    comment = NULL,
    updated_at = NOW()
WHERE instance_id IN (SELECT id FROM _backup_098_affected_instances)
  AND node_type = 'auto'
  AND status = 'approved';

-- Step 3: 重置 erp_meta（清理 status、requestLog、responseData）
UPDATE oa_approval_instances
SET erp_meta = jsonb_set(
      jsonb_set(
        jsonb_set(COALESCE(erp_meta, '{}'), '{status}', '"pending"'),
        '{requestLog}', 'null'
      ),
      '{responseData}', '{}'
    ),
    updated_at = NOW()
WHERE id IN (SELECT id FROM _backup_098_affected_instances);

-- Step 4: 校正 current_node_order 为第一个 pending 环节的 order
UPDATE oa_approval_instances i
SET current_node_order = (
    SELECT MIN(n.node_order)
    FROM oa_approval_nodes n
    WHERE n.instance_id = i.id
      AND n.status IN ('pending', 'processing')
),
updated_at = NOW()
WHERE i.id IN (SELECT id FROM _backup_098_affected_instances);

-- Step 5: 插入修复操作记录（审计轨迹）
INSERT INTO oa_approval_actions (instance_id, action_type, operator_name, comment)
SELECT id, 'data_fix', '系统',
       '数据修复(098): 回退被定时任务提前执行的自动环节'
FROM _backup_098_affected_instances;

-- Step 6: 验证修复结果
DO $$
DECLARE remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM oa_approval_instances i
  WHERE i.status = 'pending'
    AND EXISTS (
      SELECT 1 FROM oa_approval_nodes n
      WHERE n.instance_id = i.id AND n.node_type = 'auto' AND n.status = 'approved'
    )
    AND EXISTS (
      SELECT 1 FROM oa_approval_nodes n
      WHERE n.instance_id = i.id AND n.node_type != 'auto' AND n.status IN ('pending', 'processing')
    );
  IF remaining > 0 THEN
    RAISE EXCEPTION '修复后仍有 % 个审批单状态不一致，请人工检查', remaining;
  END IF;
  RAISE NOTICE '数据修复验证通过：所有受影响审批单已恢复正常';
END $$;

COMMIT;
