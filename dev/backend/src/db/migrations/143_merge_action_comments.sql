-- 迁移 143: 合并独立评论记录到操作记录
-- 背景：之前每个操作（approve/reject/transfer 等）带评论时，会同时插入：
--   (a) 操作记录（comment = NULL）
--   (b) 独立的 action_type='comment' 记录（包含评论内容）
-- 现在评论直接写入操作记录的 comment 字段，不再创建独立评论记录。
-- 此脚本将历史独立评论合并到对应操作记录中，并删除冗余的评论记录。

BEGIN;

-- Step 1: 将独立评论合并到同一 instance_id、node_order、operator_id 且时间相近（5秒内）的操作记录
UPDATE oa_approval_actions AS target
SET comment = src.comment
FROM (
  SELECT c.id AS comment_id, c.instance_id, c.node_order, c.operator_id, c.comment, c.action_at
  FROM oa_approval_actions c
  WHERE c.action_type = 'comment'
    AND c.comment IS NOT NULL
    AND c.comment != ''
) AS src
WHERE target.instance_id = src.instance_id
  AND target.node_order = src.node_order
  AND target.operator_id = src.operator_id
  AND target.action_type != 'comment'
  AND (target.comment IS NULL OR target.comment = '')
  AND ABS(EXTRACT(EPOCH FROM (target.action_at - src.action_at))) <= 5;

-- Step 2: 删除已被合并的独立评论记录
-- （只删除那些在同一 instance/node/operator 且时间相近有其他操作记录的评论）
DELETE FROM oa_approval_actions
WHERE id IN (
  SELECT c.id
  FROM oa_approval_actions c
  WHERE c.action_type = 'comment'
    AND c.comment IS NOT NULL
    AND c.comment != ''
    AND EXISTS (
      SELECT 1 FROM oa_approval_actions a
      WHERE a.instance_id = c.instance_id
        AND a.node_order = c.node_order
        AND a.operator_id = c.operator_id
        AND a.action_type != 'comment'
        AND ABS(EXTRACT(EPOCH FROM (a.action_at - c.action_at))) <= 5
    )
);

-- Step 3: 将历史操作记录中 attachments 为 '[]' 的统一为 NULL
UPDATE oa_approval_actions
SET attachments = NULL
WHERE attachments::text = '[]';

COMMIT;
