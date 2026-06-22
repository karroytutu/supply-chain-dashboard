-- =====================================================
-- 118: 修复 ar_collection auto 环节(node 7)失败导致的异常数据
-- depends_on: 117
-- =====================================================
-- 背景：催收流程从自定义路由重构为 OA 通用条件机制时，
-- 删除了旧的 onApprovedArCollection 回调但未补充轻量替代，
-- 导致"更新催收状态"环节（node 7，auto 类型）执行时因缺少
-- onApproved 回调而必然崩溃（TypeError），node 7 被标记为 failed，
-- 催收单被标记为 erp_failed。
--
-- 本脚本修复这些受损数据：
-- 1. 将 node 7 从 failed 重置为 pending
-- 2. 将催收单从 erp_failed 恢复为 processing
-- 3. 清除 erp_meta 中的错误信息
-- 4. 恢复卡住的后台异步任务

-- =====================================================
-- 步骤 1: 重置 node 7 状态（failed → pending）
-- =====================================================
UPDATE oa_approval_nodes n
SET status = 'pending',
    acted_at = NULL,
    comment = NULL
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE n.instance_id = i.id
  AND ft.code = 'ar_collection'
  AND n.node_type = 'auto'
  AND n.node_order = 7
  AND n.status = 'failed';

-- =====================================================
-- 步骤 2: 恢复催收单状态（erp_failed → processing）
-- 仅恢复因 node 7 auto 环节失败而进入 erp_failed 的催收单
-- =====================================================
UPDATE oa_approval_instances i
SET status = 'processing',
    current_node_order = 7,
    updated_at = NOW(),
    erp_meta = jsonb_set(
      COALESCE(erp_meta, '{}'::jsonb),
      '{status}',
      '"processing"'
    )
FROM oa_form_types ft
WHERE i.form_type_id = ft.id
  AND ft.code = 'ar_collection'
  AND i.status = 'erp_failed'
  AND EXISTS (
    SELECT 1 FROM oa_approval_nodes n
    WHERE n.instance_id = i.id
      AND n.node_type = 'auto'
      AND n.node_order = 7
      AND n.status = 'pending'  -- 步骤 1 已重置
  )
  -- 排除有其他 auto 环节也失败的催收单
  AND NOT EXISTS (
    SELECT 1 FROM oa_approval_nodes n2
    WHERE n2.instance_id = i.id
      AND n2.node_type = 'auto'
      AND n2.status = 'failed'
  );

-- =====================================================
-- 步骤 3: 插入系统评论记录修复操作
-- =====================================================
INSERT INTO oa_approval_actions (instance_id, action_type, operator_name, node_order, comment)
SELECT i.id, 'comment', '系统', 7,
       '数据修复：自动核销环节已恢复，等待重新执行核销校验'
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE ft.code = 'ar_collection'
  AND i.status = 'processing'
  AND i.current_node_order = 7
  AND EXISTS (
    SELECT 1 FROM oa_approval_nodes n
    WHERE n.instance_id = i.id
      AND n.node_type = 'auto'
      AND n.node_order = 7
      AND n.status = 'pending'
  );

-- =====================================================
-- 步骤 4: 恢复卡住的后台异步任务（dead_letter → pending）
-- =====================================================
UPDATE oa_async_tasks
SET status = 'pending',
    retries = 0,
    next_retry_at = NOW(),
    error = NULL,
    updated_at = NOW()
WHERE type = 'execute_auto_node'
  AND status IN ('dead_letter', 'failed')
  AND payload->>'instanceId' IN (
    SELECT i.id::text
    FROM oa_approval_instances i
    JOIN oa_form_types ft ON i.form_type_id = ft.id
    WHERE ft.code = 'ar_collection'
      AND i.status = 'processing'
      AND i.current_node_order = 7
  );
