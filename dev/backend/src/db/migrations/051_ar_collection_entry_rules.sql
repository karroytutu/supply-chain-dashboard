-- 催收准入规则框架：新增 entry_reasons 和 entry_rule_snapshot 字段
-- 遵循 penalty_rule_snapshot / assessment_rule_snapshot 的 JSONB 快照模式

-- 任务表：入催原因（规则代码数组，支持多规则触发）
ALTER TABLE ar_collection_tasks ADD COLUMN IF NOT EXISTS entry_reasons VARCHAR(30)[] DEFAULT '{}';

-- 任务表：规则快照（JSONB，审计时可还原规则评估上下文）
ALTER TABLE ar_collection_tasks ADD COLUMN IF NOT EXISTS entry_rule_snapshot JSONB;

-- 明细表：压单标记（仅记录属性，不影响流程）
ALTER TABLE ar_collection_details ADD COLUMN IF NOT EXISTS hoard_tag VARCHAR(20);

-- 回填：所有历史任务均由逾期天数规则触发
UPDATE ar_collection_tasks SET entry_reasons = '{"overdue_days"}' WHERE entry_reasons = '{}';

-- GIN 索引支持数组包含查询（如 WHERE entry_reasons @> '{max_overdue_orders}'）
CREATE INDEX IF NOT EXISTS idx_tasks_entry_reasons ON ar_collection_tasks USING GIN (entry_reasons);
