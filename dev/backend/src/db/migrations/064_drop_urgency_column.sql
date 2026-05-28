-- 删除 oa_approval_instances 表中不再使用的 urgency 列
ALTER TABLE oa_approval_instances DROP COLUMN IF EXISTS urgency;
