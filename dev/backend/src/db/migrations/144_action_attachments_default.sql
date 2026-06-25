BEGIN;

-- 修正 attachments 列默认值：从空数组改为 NULL
-- 原因：业务代码中无附件时统一写入 NULL，默认值 '[]' 与实际语义不一致
-- 注意：不修改已执行的 migration 139（已执行迁移不可修改原则）
ALTER TABLE oa_approval_actions ALTER COLUMN attachments SET DEFAULT NULL;

-- 将已有的空数组记录统一为 NULL
UPDATE oa_approval_actions SET attachments = NULL WHERE attachments = '[]'::jsonb;

COMMIT;
