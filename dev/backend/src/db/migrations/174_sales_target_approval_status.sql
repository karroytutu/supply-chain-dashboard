-- 目标管理审批状态支持
-- 新增 status 和 oa_instance_id 字段，支持草稿→提交→审批→生效的完整流程

-- UP: 新增列
ALTER TABLE sales_targets
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS oa_instance_id INTEGER;

-- 已有数据默认 approved（向后兼容现有“保存即生效”行为）
UPDATE sales_targets SET status = 'approved';

-- 部分索引：优化概览查询（只索引 approved 记录）
CREATE INDEX IF NOT EXISTS idx_sales_targets_approved
  ON sales_targets(year, month) WHERE status = 'approved';

-- DOWN: 回滚逻辑
-- DROP INDEX IF EXISTS idx_sales_targets_approved;
-- ALTER TABLE sales_targets DROP COLUMN IF EXISTS oa_instance_id;
-- ALTER TABLE sales_targets DROP COLUMN IF EXISTS status;
