-- 每日统计快照表
-- 用于保存历史统计数据，支持环比计算
CREATE TABLE IF NOT EXISTS ar_daily_stats (
  id SERIAL PRIMARY KEY,
  stat_date DATE NOT NULL,
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  overdue_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  overdue_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  avg_aging_days DECIMAL(5,2) NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  overdue_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT uk_ar_daily_stats_date UNIQUE (stat_date)
);

-- 创建日期索引，加速按日期查询
CREATE INDEX IF NOT EXISTS idx_ar_daily_stats_date ON ar_daily_stats(stat_date);

-- 添加注释
COMMENT ON TABLE ar_daily_stats IS '应收账款每日统计快照表，用于环比计算';
COMMENT ON COLUMN ar_daily_stats.stat_date IS '统计日期';
COMMENT ON COLUMN ar_daily_stats.total_amount IS '应收总额';
COMMENT ON COLUMN ar_daily_stats.overdue_amount IS '逾期总额';
COMMENT ON COLUMN ar_daily_stats.overdue_rate IS '逾期率(%)';
COMMENT ON COLUMN ar_daily_stats.avg_aging_days IS '平均账龄(天)';
COMMENT ON COLUMN ar_daily_stats.total_count IS '应收单据总数';
COMMENT ON COLUMN ar_daily_stats.overdue_count IS '逾期单据数';
