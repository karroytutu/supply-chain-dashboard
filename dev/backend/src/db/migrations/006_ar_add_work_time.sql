-- 应收账款增加欠款日期字段
-- workTime: 欠款确认日期（送达确认后产生欠款的时间）
-- 用于计算账龄和到期日

-- 添加 work_time 字段
ALTER TABLE ar_receivables ADD COLUMN IF NOT EXISTS work_time TIMESTAMP;

-- 添加注释
COMMENT ON COLUMN ar_receivables.work_time IS '欠款确认日期(来自ERP workTime)，用于计算账龄';

-- 更新 due_date 计算说明
COMMENT ON COLUMN ar_receivables.due_date IS '到期日(work_time + max_debt_days)，用于判断逾期';

-- 创建索引（用于按欠款日期查询）
CREATE INDEX IF NOT EXISTS idx_ar_receivables_work_time ON ar_receivables(work_time);
