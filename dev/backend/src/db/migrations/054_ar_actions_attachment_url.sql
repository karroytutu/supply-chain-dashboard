-- 为操作日志表添加附件URL字段
-- 支持提起诉讼、发送催收函、更新法律进展等操作在操作历史中展示附件

ALTER TABLE ar_collection_actions ADD COLUMN IF NOT EXISTS attachment_url TEXT;
