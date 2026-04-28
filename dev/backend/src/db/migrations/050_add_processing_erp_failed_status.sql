-- =====================================================
-- 迁移 050: 为自动节点异步执行框架添加新状态
-- 相关状态:
--   oa_approval_instances.status: 新增 processing / erp_failed
--   oa_approval_nodes.status: 新增 processing / failed
-- =====================================================

-- 更新列注释，反映新的状态枚举值
COMMENT ON COLUMN oa_approval_instances.status IS '状态：pending/processing/approved/rejected/erp_failed/cancelled/withdrawn';
COMMENT ON COLUMN oa_approval_nodes.status IS '状态：pending/processing/approved/rejected/transferred/failed/skipped/cancelled';

-- 为 processing 状态创建部分索引，供卡住任务恢复定时查询使用
CREATE INDEX IF NOT EXISTS idx_oa_instances_processing
  ON oa_approval_instances(id, updated_at)
  WHERE status = 'processing';

-- 为 erp_failed 状态创建部分索引，供重试操作查询使用
CREATE INDEX IF NOT EXISTS idx_oa_instances_erp_failed
  ON oa_approval_instances(id, updated_at)
  WHERE status = 'erp_failed';

-- 数据修补：将旧数据中 erp_meta.status='processing' 但实例状态仍为 pending 的记录
-- 修正为 processing 状态（历史遗留的卡住记录）
UPDATE oa_approval_instances
SET status = 'processing', updated_at = NOW()
WHERE status = 'pending'
  AND erp_meta->>'status' = 'processing';
