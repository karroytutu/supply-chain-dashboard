-- 168: erp_sync_log 增加 sync_window 字段
-- 记录每次同步的窗口类型 (hot/warm/cold/all)，snapshot 数据集为 null

ALTER TABLE erp_sync_log ADD COLUMN IF NOT EXISTS sync_window TEXT;
COMMENT ON COLUMN erp_sync_log.sync_window IS '窗口类型: hot/warm/cold/all (snapshot数据集为null)';

-- 索引：按 source_id + sync_window 查询各窗口最近同步
CREATE INDEX IF NOT EXISTS idx_sync_log_source_window ON erp_sync_log(source_id, sync_window);
