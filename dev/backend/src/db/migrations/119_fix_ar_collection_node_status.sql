-- =====================================================
-- 119: 修复催收实例节点状态不一致 + 重命名自动环节
-- depends_on: 118
-- =====================================================
-- 背景：migration 117 步骤 C1 无条件重置了所有在途催收实例的 node 1 为 pending，
-- 包括已经营销师合法审批通过的实例。随后 recoverStuckAutoNodes 定时任务误判
-- 实例为"卡住"状态，强行执行了系统自动环节（核销校验），导致：
--   - node 1 (营销师催收) 状态为 pending，但有 approve 操作记录
--   - auto 节点在流程尚未到达时被错误执行并标记为 approved
--
-- 同时，系统自动环节的名称"更新催收状态"与实际功能（核销校验）不一致，
-- 一并修正。
--
-- 本脚本修复：
--   1. 恢复营销师催收环节为已完成（基于操作记录判定）
--   2. 重置被错误执行的系统自动环节回待处理
--   3. 确保营销经理催收环节状态正确
--   4. 重新计算当前活动环节
--   5. 重命名自动环节（更新催收状态 → 核销校验）
--   6. 恢复卡住的后台任务
--   7. 记录修复操作日志

-- =====================================================
-- 步骤 1: 恢复营销师催收环节为"已完成"
-- =====================================================
-- 条件：node 1 当前为 pending，但 oa_approval_actions 中有 approve 记录
-- acted_at 取操作记录的时间戳，还原营销师实际操作的时间点
UPDATE oa_approval_nodes n
SET status = 'approved',
    acted_at = COALESCE(
      (SELECT MAX(a.action_at)
       FROM oa_approval_actions a
       WHERE a.instance_id = n.instance_id
         AND a.action_type = 'approve'
         AND a.node_order = 1),
      NOW()
    )
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE n.instance_id = i.id
  AND ft.code = 'ar_collection'
  AND i.status IN ('pending', 'processing')
  AND n.node_order = 1
  AND n.status = 'pending'
  AND EXISTS (
    SELECT 1 FROM oa_approval_actions a
    WHERE a.instance_id = n.instance_id
      AND a.action_type = 'approve'
      AND a.node_order = 1
  );

-- =====================================================
-- 步骤 2: 重置被错误执行的系统自动环节回"待处理"
-- =====================================================
-- 条件：auto 节点已 approved，但存在 node_order 更小的非 auto 节点仍为 pending
-- 使用 node_type = 'auto' 定位，兼容 node_order=3（旧结构）和 node_order=7（新结构）
UPDATE oa_approval_nodes n
SET status = 'pending',
    acted_at = NULL,
    comment = NULL
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE n.instance_id = i.id
  AND ft.code = 'ar_collection'
  AND i.status IN ('pending', 'processing')
  AND n.node_type = 'auto'
  AND n.status = 'approved'
  AND EXISTS (
    SELECT 1 FROM oa_approval_nodes n2
    WHERE n2.instance_id = n.instance_id
      AND n2.node_type IN ('approval', 'handle')
      AND n2.node_order < n.node_order
      AND n2.status IN ('pending', 'processing')
  );

-- =====================================================
-- 步骤 3: 确保营销经理催收环节状态正确
-- =====================================================
-- 当催收单选择了"升级"操作（form_data 中 mgrAction 有值）且 node 2 为 skipped 时，
-- 将其激活为 pending（前提：node 1 已 approved）
UPDATE oa_approval_nodes n
SET status = 'pending', acted_at = NULL
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE n.instance_id = i.id
  AND ft.code = 'ar_collection'
  AND i.status IN ('pending', 'processing')
  AND n.node_order = 2
  AND n.status = 'skipped'
  AND i.form_data ? 'mgrAction'
  AND i.form_data->>'mgrAction' IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM oa_approval_nodes n1
    WHERE n1.instance_id = n.instance_id
      AND n1.node_order = 1
      AND n1.status = 'approved'
  );

-- =====================================================
-- 步骤 4: 重新计算当前活动环节
-- =====================================================
-- 将 current_node_order 指向第一个 pending 的人工环节（排除 auto/cc 类型）
UPDATE oa_approval_instances i
SET current_node_order = sub.next_order,
    updated_at = NOW()
FROM (
  SELECT n.instance_id, MIN(n.node_order) AS next_order
  FROM oa_approval_nodes n
  JOIN oa_approval_instances i2 ON n.instance_id = i2.id
  JOIN oa_form_types ft ON i2.form_type_id = ft.id
  WHERE ft.code = 'ar_collection'
    AND i2.status IN ('pending', 'processing')
    AND n.node_type IN ('approval', 'handle')
    AND n.status = 'pending'
  GROUP BY n.instance_id
) sub
WHERE i.id = sub.instance_id;

-- =====================================================
-- 步骤 5: 重命名自动环节（更新催收状态 → 核销校验）
-- =====================================================
-- 将所有 ar_collection 实例中旧名称统一更新，使节点名称与实际功能一致
UPDATE oa_approval_nodes n
SET node_name = '核销校验'
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE n.instance_id = i.id
  AND ft.code = 'ar_collection'
  AND n.node_name = '更新催收状态';

-- =====================================================
-- 步骤 6: 恢复卡住的后台任务
-- =====================================================
-- 将因自动环节误执行而进入 dead_letter/failed 状态的异步任务恢复为 pending
UPDATE oa_async_tasks t
SET status = 'pending',
    retries = 0,
    next_retry_at = NOW(),
    error = NULL,
    updated_at = NOW()
WHERE t.type = 'execute_auto_node'
  AND t.status IN ('dead_letter', 'failed')
  AND t.payload->>'instanceId' IN (
    SELECT i.id::text
    FROM oa_approval_instances i
    JOIN oa_form_types ft ON i.form_type_id = ft.id
    WHERE ft.code = 'ar_collection'
      AND i.status IN ('pending', 'processing')
      AND EXISTS (
        SELECT 1 FROM oa_approval_nodes n
        WHERE n.instance_id = i.id
          AND n.node_type = 'auto'
          AND n.status = 'pending'
      )
  );

-- =====================================================
-- 步骤 7: 记录修复操作日志（审计追踪）
-- =====================================================
INSERT INTO oa_approval_actions (instance_id, action_type, operator_name, comment)
SELECT i.id, 'comment', '系统',
       '数据修复(migration 119)：恢复营销师催收环节为已完成，重置核销校验环节为待执行'
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE ft.code = 'ar_collection'
  AND i.status IN ('pending', 'processing')
  AND EXISTS (
    SELECT 1 FROM oa_approval_nodes n
    WHERE n.instance_id = i.id
      AND n.node_order = 1
      AND n.status = 'approved'
      AND n.acted_at IS NOT NULL
  )
  AND EXISTS (
    SELECT 1 FROM oa_approval_nodes n
    WHERE n.instance_id = i.id
      AND n.node_type = 'auto'
      AND n.status = 'pending'
  );

-- =====================================================
-- 验证查询（执行后运行，确认修复结果）
-- =====================================================

-- 验证1: 不存在 node 1 为 pending 但有 approve 记录的实例
-- SELECT COUNT(*) FROM oa_approval_nodes n
-- JOIN oa_approval_instances i ON n.instance_id = i.id
-- JOIN oa_form_types ft ON i.form_type_id = ft.id
-- WHERE ft.code = 'ar_collection' AND i.status IN ('pending', 'processing')
--   AND n.node_order = 1 AND n.status = 'pending'
--   AND EXISTS (
--     SELECT 1 FROM oa_approval_actions a
--     WHERE a.instance_id = n.instance_id AND a.action_type = 'approve' AND a.node_order = 1
--   );
-- 预期: 0

-- 验证2: 不存在 auto 节点已 approved 但前面有 pending 人工节点的实例
-- SELECT COUNT(*) FROM oa_approval_nodes n
-- JOIN oa_approval_instances i ON n.instance_id = i.id
-- JOIN oa_form_types ft ON i.form_type_id = ft.id
-- WHERE ft.code = 'ar_collection' AND i.status IN ('pending', 'processing')
--   AND n.node_type = 'auto' AND n.status = 'approved'
--   AND EXISTS (
--     SELECT 1 FROM oa_approval_nodes n2
--     WHERE n2.instance_id = n.instance_id
--       AND n2.node_type IN ('approval', 'handle')
--       AND n2.node_order < n.node_order
--       AND n2.status IN ('pending', 'processing')
--   );
-- 预期: 0

-- 验证3: current_node_order 应指向第一个 pending 人工节点
-- SELECT COUNT(*) FROM oa_approval_instances i
-- JOIN oa_form_types ft ON i.form_type_id = ft.id
-- WHERE ft.code = 'ar_collection' AND i.status IN ('pending', 'processing')
--   AND i.current_node_order != (
--     SELECT MIN(n.node_order) FROM oa_approval_nodes n
--     WHERE n.instance_id = i.id AND n.node_type IN ('approval', 'handle') AND n.status = 'pending'
--   );
-- 预期: 0

-- 验证4: 所有自动环节名称均为"核销校验"
-- SELECT COUNT(*) FROM oa_approval_nodes n
-- JOIN oa_approval_instances i ON n.instance_id = i.id
-- JOIN oa_form_types ft ON i.form_type_id = ft.id
-- WHERE ft.code = 'ar_collection'
--   AND n.node_type = 'auto'
--   AND n.node_name != '核销校验';
-- 预期: 0
