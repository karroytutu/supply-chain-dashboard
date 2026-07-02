-- 169: erp_sync_status 增加 window_counts 列
-- 存储各窗口（hot/warm/cold）数据量的预计算值，由同步完成后更新

ALTER TABLE erp_sync_status ADD COLUMN IF NOT EXISTS window_counts JSONB;
COMMENT ON COLUMN erp_sync_status.window_counts IS '各窗口数据量预计算值，格式: {"hot": N, "warm": N, "cold": N}';
