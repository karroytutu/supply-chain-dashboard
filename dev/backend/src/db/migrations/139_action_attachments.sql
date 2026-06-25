-- 为 oa_approval_actions 表新增附件列
-- 用途：审批附言和独立评论均可携带图片/文件附件
ALTER TABLE oa_approval_actions
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
COMMENT ON COLUMN oa_approval_actions.attachments IS '操作附件列表（图片/文件元数据）';
