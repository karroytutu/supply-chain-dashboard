-- 091: 清理催收废弃表（OA 迁移后零引用）
--
-- ar_legal_progress: 法律催收进展表，已被 OA 审批动作替代
-- ar_evidence_files: 凭证文件表，已被 OA 附件替代
-- 这两张表在当前代码中无任何 INSERT/UPDATE/SELECT 引用

BEGIN;

-- 先删除引用 ar_evidence_files 的外键（使用 CASCADE 确保兼容不同约束命名）
ALTER TABLE ar_extension_records
  DROP CONSTRAINT IF EXISTS ar_extension_records_evidence_file_id_fkey;
ALTER TABLE ar_extension_records
  DROP CONSTRAINT IF EXISTS fk_extension_evidence;

DROP TABLE IF EXISTS ar_legal_progress CASCADE;
DROP TABLE IF EXISTS ar_evidence_files CASCADE;

COMMIT;
