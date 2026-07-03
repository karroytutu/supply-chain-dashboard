-- 为考核记录的 calculated_at 字段添加索引
-- 用于优化考核中心列表按计算时间倒序排序的查询性能
CREATE INDEX IF NOT EXISTS idx_assessment_records_calculated
  ON assessment_records(calculated_at DESC);

-- Rollback:
-- DROP INDEX IF EXISTS idx_assessment_records_calculated;
