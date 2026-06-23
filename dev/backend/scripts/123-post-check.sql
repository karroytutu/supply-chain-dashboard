-- =====================================================
-- 二次检查：清理迁移 123 + 修复脚本执行后的数据残留
-- =====================================================
-- 背景：
--   迁移 123 和 fix-dingtalk-alignment.ts 已执行，
--   但存在两个已知数据质量问题需要清理：
--   1. 迁移 123 的 ARRAY[COALESCE(...)] 可能产生 assigned_user_ids = {NULL} 的节点
--   2. 修复脚本 B 类处理未清理旧 pending task_mapping，可能残留重复记录
-- =====================================================

-- =====================================================
-- 检查 1：assigned_user_ids 含 NULL 元素的节点
-- =====================================================
SELECT n.id, n.instance_id, i.instance_no, i.title, n.assigned_user_ids
FROM oa_approval_nodes n
JOIN oa_approval_instances i ON n.instance_id = i.id
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE ft.code = 'ar_collection'
  AND n.node_order = 1 AND n.round = 1
  AND (n.assigned_user_ids IS NULL
       OR n.assigned_user_ids = '{NULL}'::integer[]
       OR array_length(n.assigned_user_ids, 1) = 0);
-- 预期：0 行（如果有结果，执行下方修复）

-- 修复 1：将 NULL 审批人替换为 admin 角色用户
-- （仅当检查 1 有结果时才执行）
-- UPDATE oa_approval_nodes n
-- SET assigned_user_ids = ARRAY[(
--   SELECT u.id FROM user_roles ur
--   JOIN roles r ON r.id = ur.role_id
--   JOIN users u ON u.id = ur.user_id
--   WHERE r.code = 'admin' AND r.status = 1 AND u.status = 1
--   LIMIT 1
-- )]
-- WHERE n.id IN (<检查 1 查出的 id 列表>);

-- =====================================================
-- 检查 2：同一 instance_id + executor_user_id 下重复 pending 记录
-- =====================================================
SELECT instance_id, executor_user_id, COUNT(*) as cnt
FROM oa_process_task_mapping
WHERE status = 'pending'
GROUP BY instance_id, executor_user_id
HAVING COUNT(*) > 1;
-- 预期：0 行（如果有结果，执行下方修复）

-- 修复 2：保留最新的 pending，其余标记为 canceled
-- （仅当检查 2 有结果时才执行）
-- UPDATE oa_process_task_mapping t
-- SET status = 'canceled', completed_at = NOW()
-- WHERE t.status = 'pending'
--   AND EXISTS (
--     SELECT 1 FROM oa_process_task_mapping t2
--     WHERE t2.instance_id = t.instance_id
--       AND t2.executor_user_id = t.executor_user_id
--       AND t2.status = 'pending'
--       AND t2.created_at > t.created_at
--   );
