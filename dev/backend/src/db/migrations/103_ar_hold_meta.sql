-- 103: 创建压单元数据表 + 迁移旧数据
-- 业务目的：将旧 ar_collection_details 中的压单审批记录迁移到专用轻量表
-- 旧催收系统（ar_collection_tasks/details/actions/extension_records）已被OA系统替代
-- 压单元数据是唯一需要从旧系统保留的数据（用于催收时排除被压单的单据）

BEGIN;

-- ============================================
-- 1. 创建压单元数据表
-- ============================================
CREATE TABLE IF NOT EXISTS ar_hold_meta (
  erp_bill_id VARCHAR(64) PRIMARY KEY,   -- ERP单据ID（唯一约束，同一单据只能有一条压单记录）
  hold_type VARCHAR(20) NOT NULL,         -- 压单类型: long_term=长期压单, time_limited=期限压单
  hold_days INTEGER,                      -- 期限压单天数（仅 time_limited 有效）
  hold_until DATE,                        -- 期限压单到期日（到期后自动解除压单）
  source_instance_id INTEGER,             -- 来源OA审批实例ID（customer_credit）
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 期限压单到期检查的部分索引（定时任务高效扫描）
CREATE INDEX IF NOT EXISTS idx_hold_meta_until
  ON ar_hold_meta(hold_until) WHERE hold_type = 'time_limited';

-- ============================================
-- 2. 从旧表迁移活跃压单数据
-- ============================================
INSERT INTO ar_hold_meta (erp_bill_id, hold_type, hold_days, hold_until)
SELECT DISTINCT ON (erp_bill_id) erp_bill_id, hold_type, hold_days, hold_until
FROM ar_collection_details
WHERE hold_type IS NOT NULL AND erp_bill_id IS NOT NULL
ORDER BY erp_bill_id, id DESC
ON CONFLICT DO NOTHING;

-- ============================================
-- 3. 归档旧催收系统表（RENAME 保留回滚能力，30天后可 DROP）
-- ============================================
-- 旧系统已被OA审批系统完全替代，以下表归档保留数据用于审计/回滚
ALTER TABLE ar_collection_tasks RENAME TO _archived_ar_collection_tasks;
ALTER TABLE ar_collection_details RENAME TO _archived_ar_collection_details;
ALTER TABLE ar_collection_actions RENAME TO _archived_ar_collection_actions;
ALTER TABLE ar_extension_records RENAME TO _archived_ar_extension_records;
-- ar_warning_reminders 保留原名（历史预警记录仍有查询价值）

COMMIT;
