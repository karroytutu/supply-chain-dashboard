-- 为 recoverStuckAutoNodes 定时恢复查询添加部分索引
-- 与现有 idx_oa_instances_processing (050号迁移) 模式一致
-- 加速查询：status='pending' + updated_at 过期的实例

CREATE INDEX IF NOT EXISTS idx_oa_instances_pending_stuck
  ON oa_approval_instances(id, updated_at)
  WHERE status = 'pending';
