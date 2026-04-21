-- 037: 修复催收任务重复创建问题
-- 执行时间: 2026-04-21
-- 说明: 为 ar_collection_details.erp_bill_id 添加唯一约束防止重复明细，
--       为 ar_collection_tasks 添加部分唯一索引防止同一客户同日重复任务

-- ============================================
-- 1. 清理历史重复数据（保留最早创建的记录）
-- ============================================

-- 清理 ar_collection_details 中的重复 erp_bill_id 记录
-- 保留每组中 id 最小的（最早创建的），删除其余重复
DELETE FROM ar_collection_details a
USING ar_collection_details b
WHERE a.erp_bill_id = b.erp_bill_id
  AND a.erp_bill_id IS NOT NULL
  AND a.id > b.id;

-- 清理 ar_collection_tasks 中同一客户同一逾期日期的重复活跃任务
-- 保留每组中 id 最小的
DELETE FROM ar_collection_tasks a
USING ar_collection_tasks b
WHERE a.consumer_code = b.consumer_code
  AND a.first_overdue_date = b.first_overdue_date
  AND a.status NOT IN ('closed', 'cancelled')
  AND b.status NOT IN ('closed', 'cancelled')
  AND a.id > b.id;

-- ============================================
-- 2. 添加唯一约束
-- ============================================

-- erp_bill_id 唯一约束：同一 ERP 单据只能对应一条催收明细
ALTER TABLE ar_collection_details
  DROP CONSTRAINT IF EXISTS uk_details_erp_bill;
ALTER TABLE ar_collection_details
  ADD CONSTRAINT uk_details_erp_bill UNIQUE (erp_bill_id);

-- 部分唯一索引：同一客户同一首次逾期日期，不允许存在多个活跃任务
-- 仅约束非关闭/取消状态的任务
CREATE UNIQUE INDEX IF NOT EXISTS uk_active_task_consumer_overdue
  ON ar_collection_tasks (consumer_code, first_overdue_date)
  WHERE status NOT IN ('closed', 'cancelled');
