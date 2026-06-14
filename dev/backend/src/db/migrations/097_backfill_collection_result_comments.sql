-- 097_backfill_collection_result_comments.sql
-- 为历史催收OA实例回填处理结果评论
--
-- 背景：在自动环节显示处理结果功能上线前，已有15个催收实例缺少处理结果评论。
-- 策略：根据环节结构推断操作结果，时间戳使用自动环节的实际完成时间（acted_at）。

BEGIN;

INSERT INTO oa_approval_actions (instance_id, action_type, operator_name, node_order, comment, action_at)
SELECT
  i.id,
  'comment',
  '系统',
  -- 找到营销师催收环节之后的第一个自动环节（即处理营销师操作的自动环节）
  (SELECT n.node_order FROM oa_approval_nodes n
   WHERE n.instance_id = i.id AND n.node_type = 'auto' AND n.status = 'approved'
     AND n.acted_at IS NOT NULL
   ORDER BY n.node_order LIMIT 1),
  -- 根据操作类型和环节结构推断评论文本
  CASE
    -- 核销标记 + 已通过 + 无继续催收环节 → 全部核销
    WHEN i.form_data->>'action' = 'verify' AND i.status = 'approved'
         AND NOT EXISTS (SELECT 1 FROM oa_approval_nodes n WHERE n.instance_id = i.id AND n.node_name = '继续催收')
    THEN '核销验证：所有账单已全部核销，催收流程结束'

    -- 核销标记 + 已通过 + 有继续催收环节 → 部分核销
    WHEN i.form_data->>'action' = 'verify' AND i.status = 'approved'
         AND EXISTS (SELECT 1 FROM oa_approval_nodes n WHERE n.instance_id = i.id AND n.node_name = '继续催收')
    THEN '核销验证：部分账单已核销，剩余继续催收'

    -- 核销标记 + 进行中 → 验证完成但流程继续
    WHEN i.form_data->>'action' = 'verify' AND i.status = 'pending'
    THEN '核销验证完成，催收流程继续'

    -- 申请延期 + 已通过 → 从 form_data 取延期天数
    WHEN i.form_data->>'action' = 'extension' AND i.status = 'approved'
    THEN '延期' || COALESCE(i.form_data->>'extensionDays', '?') || '天已生效'

    -- 申请延期 + 进行中（含总经理审批环节）
    WHEN i.form_data->>'action' = 'extension' AND i.status = 'pending'
         AND EXISTS (SELECT 1 FROM oa_approval_nodes n WHERE n.instance_id = i.id AND n.node_name LIKE '%总经理%')
    THEN '延期' || COALESCE(i.form_data->>'extensionDays', '?') || '天，已提交总经理审批'

    -- 申请延期 + 进行中（无总经理审批环节）
    WHEN i.form_data->>'action' = 'extension' AND i.status = 'pending'
    THEN '延期' || COALESCE(i.form_data->>'extensionDays', '?') || '天已生效'

    -- 存在差异 → 有财务差异处理环节
    WHEN i.form_data->>'action' = 'difference'
         AND EXISTS (SELECT 1 FROM oa_approval_nodes n WHERE n.instance_id = i.id AND n.node_name = '财务差异处理')
    THEN '已标记差异，等待财务核实'

    -- 升级处理 → 有营销经理催收环节（L0→L1）
    WHEN i.form_data->>'action' = 'escalate'
         AND EXISTS (SELECT 1 FROM oa_approval_nodes n WHERE n.instance_id = i.id AND n.node_name = '营销经理催收')
    THEN '已升级到L1(营销经理)催收'

    -- 升级处理 → 有财务催收环节（L1→L2）
    WHEN i.form_data->>'action' = 'escalate'
         AND EXISTS (SELECT 1 FROM oa_approval_nodes n WHERE n.instance_id = i.id AND n.node_name = '财务催收')
    THEN '已升级到L2(财务)催收'

    -- 差异解决 → 有营销师催收环节
    WHEN i.form_data->>'action' = 'resolve_diff'
         AND EXISTS (SELECT 1 FROM oa_approval_nodes n WHERE n.instance_id = i.id AND n.node_name = '营销师催收')
    THEN '差异已解决，已安排营销师继续催收'

    -- 发函
    WHEN i.form_data->>'action' = 'send_letter'
    THEN '发函完成'

    -- 起诉
    WHEN i.form_data->>'action' = 'lawsuit'
    THEN '已进入起诉立案程序'

    ELSE NULL
  END,
  -- 时间戳使用自动环节的实际完成时间
  (SELECT n.acted_at FROM oa_approval_nodes n
   WHERE n.instance_id = i.id AND n.node_type = 'auto' AND n.status = 'approved'
   ORDER BY n.node_order LIMIT 1)
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE ft.code = 'ar_collection'
  -- 只回填已知操作类型，避免 CASE ELSE 产生 NULL 评论
  AND i.form_data->>'action' IN ('verify', 'extension', 'difference', 'escalate', 'resolve_diff', 'send_letter', 'lawsuit')
  AND i.form_data->>'action' IS NOT NULL
  -- 自动环节已执行（approved）
  AND EXISTS (SELECT 1 FROM oa_approval_nodes n
              WHERE n.instance_id = i.id AND n.node_type = 'auto' AND n.status = 'approved' AND n.acted_at IS NOT NULL)
  -- 尚无评论记录
  AND NOT EXISTS (SELECT 1 FROM oa_approval_actions a
                  WHERE a.instance_id = i.id AND a.action_type = 'comment');

COMMIT;
