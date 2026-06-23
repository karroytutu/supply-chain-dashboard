-- =====================================================
-- 123: 修复迁移链导致的催收 OA 实例数据异常
-- depends_on: 122
-- =====================================================
-- 背景：
--   迁移 116-121（催收流程重构）在清理旧节点模型数据时，
--   将 38 个在途 ar_collection 实例的节点一并删除，导致：
--   - 实例状态为 pending，current_node_order = 1，但 oa_approval_nodes 为空
--   - 营销师无法在审批中心操作这些实例
--
-- 本脚本：
--   1. 为 38 个无节点实例补充 node 1（营销师催收）
--   2. assigned_user_ids 优先使用钉钉流程中心已有的执行人
--   3. 插入修复操作日志（审计追踪）
-- =====================================================

BEGIN;

-- =====================================================
-- 步骤 1: 为无节点的在途催收实例创建 node 1
-- =====================================================
-- assigned_user_ids 解析优先级：
--   1. 钉钉流程中心已有的 pending 执行人（保持与钉钉待办一致）
--   2. 按 form_data->>'managerName' 精确匹配 users.name
--   3. 兜底：fallback 到 marketing_manager 角色用户

INSERT INTO oa_approval_nodes
  (instance_id, node_order, round, node_name, node_type, role_code,
   assigned_user_ids, status, sign_mode, deadline_at, timeout_config)
SELECT
  i.id,
  1,
  1,
  '营销师催收',
  'handle',
  'marketer',
  ARRAY[COALESCE(
    -- 优先：钉钉流程中心已有的执行人
    (SELECT m.executor_user_id
     FROM oa_process_task_mapping m
     WHERE m.instance_id = i.id AND m.status = 'pending'
     LIMIT 1),
    -- 其次：按 managerName 精确匹配
    (SELECT u.id
     FROM users u
     WHERE u.name = i.form_data->>'managerName' AND u.status = 1
     LIMIT 1),
    -- 兜底：fallback 到营销经理
    (SELECT u.id
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id
     JOIN users u ON u.id = ur.user_id
     WHERE r.code = 'marketing_manager' AND r.status = 1 AND u.status = 1
     LIMIT 1)
  )],
  'pending',
  'or',
  NOW() + INTERVAL '3 days',
  '{
    "durationMinutes": 4320,
    "reminder": {
      "firstReminderDelayMinutes": 0,
      "intervalMinutes": 480,
      "maxReminders": 10,
      "ccSupervisorAfterCount": 2
    },
    "assessment": {
      "exemptNodeNames": ["起诉立案", "庭审进展", "判决结果", "执行进展", "核销校验"],
      "tiers": [
        {"name": "一级考核(3-5天)", "minOverdueDays": 3, "maxOverdueDays": 5, "penaltyAmount": 10},
        {"name": "二级考核(5-7天)", "minOverdueDays": 5, "maxOverdueDays": 7, "penaltyAmount": 20},
        {"name": "三级考核(7天+)", "minOverdueDays": 7, "maxOverdueDays": null, "penaltyAmount": 50}
      ]
    }
  }'::jsonb
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE ft.code = 'ar_collection'
  AND i.status IN ('pending', 'processing')
  AND NOT EXISTS (
    SELECT 1 FROM oa_approval_nodes n WHERE n.instance_id = i.id
  );

-- =====================================================
-- 步骤 2: 插入修复操作日志（审计追踪）
-- =====================================================
INSERT INTO oa_approval_actions
  (instance_id, action_type, operator_name, comment)
SELECT i.id, 'comment', '系统',
       '数据修复(migration 123)：补充营销师催收节点，恢复待处理状态'
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE ft.code = 'ar_collection'
  AND i.status IN ('pending', 'processing')
  AND EXISTS (
    SELECT 1 FROM oa_approval_nodes n
    WHERE n.instance_id = i.id
      AND n.node_order = 1
      AND n.node_name = '营销师催收'
      AND n.round = 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM oa_approval_actions a
    WHERE a.instance_id = i.id
      AND a.comment LIKE '数据修复(migration 123)%'
  );

COMMIT;

-- =====================================================
-- 验证查询（执行后运行，确认修复结果）
-- =====================================================

-- 验证1：修复后不应有无节点的在途催收实例
-- SELECT COUNT(*) FROM oa_approval_instances i
-- JOIN oa_form_types ft ON i.form_type_id = ft.id
-- WHERE ft.code = 'ar_collection' AND i.status IN ('pending', 'processing')
--   AND NOT EXISTS (SELECT 1 FROM oa_approval_nodes n WHERE n.instance_id = i.id);
-- 预期：0

-- 验证2：所有新创建节点应有正确的 assigned_user_ids
-- SELECT COUNT(*) FROM oa_approval_nodes n
-- JOIN oa_approval_instances i ON n.instance_id = i.id
-- JOIN oa_form_types ft ON i.form_type_id = ft.id
-- WHERE ft.code = 'ar_collection' AND n.node_order = 1 AND n.round = 1
--   AND n.comment LIKE '数据修复%'
--   AND (n.assigned_user_ids IS NULL OR array_length(n.assigned_user_ids, 1) = 0);
-- 预期：0（每个节点都有审批人）

-- 验证3：确认修复的实例数量
-- SELECT COUNT(*) as fixed_count FROM oa_approval_nodes n
-- JOIN oa_approval_instances i ON n.instance_id = i.id
-- JOIN oa_form_types ft ON i.form_type_id = ft.id
-- WHERE ft.code = 'ar_collection' AND n.node_order = 1 AND n.round = 1
--   AND n.node_name = '营销师催收'
--   AND n.created_at > NOW() - interval '5 minutes';
-- 预期：38
