-- 170: 清理 full_load 功能遗留的死列
-- full_load 功能已在本次迭代中完全移除，对应的列不再使用

ALTER TABLE erp_sync_status DROP COLUMN IF EXISTS full_load_checkpoint;
ALTER TABLE erp_sync_status DROP COLUMN IF EXISTS full_load_complete;
