-- 167: 全量加载检查点支持
-- 用于 flow-window 类型数据集的首次全量加载，支持断点续传
-- full_load_checkpoint: 格式 'YYYY-MM'，表示该月及之前的数据已加载完成
-- full_load_complete: 全量加载是否已完成

ALTER TABLE erp_sync_status ADD COLUMN IF NOT EXISTS full_load_checkpoint TEXT;
ALTER TABLE erp_sync_status ADD COLUMN IF NOT EXISTS full_load_complete BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN erp_sync_status.full_load_checkpoint IS '全量加载检查点，格式 YYYY-MM，表示该月及之前数据已加载';
COMMENT ON COLUMN erp_sync_status.full_load_complete IS '全量加载是否已完成（true=完成，false=未完成或未执行）';
