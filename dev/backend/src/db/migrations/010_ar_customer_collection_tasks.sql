-- 客户维度催收任务改造
-- 将催收任务从"按单据"改为"按客户"维度
-- 数据库: xly_dashboard

-- ============================================
-- 1. 客户催收任务表（按客户维度）
-- ============================================
CREATE TABLE IF NOT EXISTS ar_customer_collection_tasks (
  id SERIAL PRIMARY KEY,
  task_no VARCHAR(50) UNIQUE NOT NULL,           -- 编号: AR-CUST-YYYYMMDD-XXXX
  consumer_name VARCHAR(200) NOT NULL,           -- 客户名称
  consumer_code VARCHAR(100),                    -- 客户编码
  manager_users VARCHAR(200),                    -- 所属营销师
  ar_ids INTEGER[] NOT NULL,                     -- 关联的 ar_receivables.id 数组
  total_amount DECIMAL(15,2) DEFAULT 0,          -- 涉及总金额
  bill_count INTEGER DEFAULT 1,                  -- 涉及单据数量
  collector_id INTEGER NOT NULL REFERENCES users(id),
  collector_role VARCHAR(20) NOT NULL,           -- marketing/supervisor/finance
  assigned_at TIMESTAMP DEFAULT NOW(),
  deadline_at TIMESTAMP NOT NULL,                -- 截止时间（3天内）
  status VARCHAR(20) DEFAULT 'pending',          -- pending/in_progress/completed/escalated/timeout
  result_type VARCHAR(30),                       -- 统一结果: customer_delay/guarantee_delay/paid_off/escalate/mixed
  latest_pay_date TIMESTAMP,                     -- 延期最迟回款日期
  evidence_url TEXT,                             -- 凭证图片URL
  signature_data TEXT,                           -- 签名数据
  escalate_reason TEXT,                          -- 升级理由
  remark TEXT,                                   -- 备注
  reviewed_by INTEGER REFERENCES users(id),      -- 审核人
  review_status VARCHAR(20),                     -- 审核状态: pending/approved/rejected
  review_comment TEXT,                           -- 审核意见
  completed_at TIMESTAMP,                        -- 完成时间
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 客户催收任务表索引
CREATE INDEX IF NOT EXISTS idx_cust_tasks_collector ON ar_customer_collection_tasks(collector_id);
CREATE INDEX IF NOT EXISTS idx_cust_tasks_status ON ar_customer_collection_tasks(status);
CREATE INDEX IF NOT EXISTS idx_cust_tasks_consumer ON ar_customer_collection_tasks(consumer_name);
CREATE INDEX IF NOT EXISTS idx_cust_tasks_manager ON ar_customer_collection_tasks(manager_users);
CREATE INDEX IF NOT EXISTS idx_cust_tasks_ar_ids ON ar_customer_collection_tasks USING GIN(ar_ids);
CREATE INDEX IF NOT EXISTS idx_cust_tasks_collector_status ON ar_customer_collection_tasks(collector_id, status);
CREATE INDEX IF NOT EXISTS idx_cust_tasks_deadline ON ar_customer_collection_tasks(deadline_at);

-- 为客户催收任务表添加更新时间触发器
DROP TRIGGER IF EXISTS update_ar_customer_collection_tasks_updated_at ON ar_customer_collection_tasks;
CREATE TRIGGER update_ar_customer_collection_tasks_updated_at
    BEFORE UPDATE ON ar_customer_collection_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. 单据级别催收结果表（支持混合操作）
-- ============================================
CREATE TABLE IF NOT EXISTS ar_bill_results (
  id SERIAL PRIMARY KEY,
  customer_task_id INTEGER NOT NULL REFERENCES ar_customer_collection_tasks(id) ON DELETE CASCADE,
  ar_id INTEGER NOT NULL REFERENCES ar_receivables(id) ON DELETE CASCADE,
  result_type VARCHAR(30) NOT NULL,              -- customer_delay/guarantee_delay/paid_off/escalate
  latest_pay_date TIMESTAMP,                     -- 延期日期
  evidence_url TEXT,                             -- 凭证URL
  remark TEXT,                                   -- 备注
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(customer_task_id, ar_id)
);

-- 单据结果表索引
CREATE INDEX IF NOT EXISTS idx_bill_results_task ON ar_bill_results(customer_task_id);
CREATE INDEX IF NOT EXISTS idx_bill_results_ar ON ar_bill_results(ar_id);

-- 为单据结果表添加更新时间触发器
DROP TRIGGER IF EXISTS update_ar_bill_results_updated_at ON ar_bill_results;
CREATE TRIGGER update_ar_bill_results_updated_at
    BEFORE UPDATE ON ar_bill_results
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 3. 修改现有表：新增客户任务关联字段
-- ============================================

-- ar_receivables 新增客户任务关联
ALTER TABLE ar_receivables
  ADD COLUMN IF NOT EXISTS customer_task_id INTEGER REFERENCES ar_customer_collection_tasks(id);

-- ar_penalty_records 新增客户任务关联
ALTER TABLE ar_penalty_records
  ADD COLUMN IF NOT EXISTS customer_task_id INTEGER REFERENCES ar_customer_collection_tasks(id);

-- ar_action_logs 新增客户任务关联
ALTER TABLE ar_action_logs
  ADD COLUMN IF NOT EXISTS customer_task_id INTEGER REFERENCES ar_customer_collection_tasks(id);

-- 新增索引
CREATE INDEX IF NOT EXISTS idx_ar_receivables_customer_task_id ON ar_receivables(customer_task_id);
CREATE INDEX IF NOT EXISTS idx_ar_penalty_records_customer_task_id ON ar_penalty_records(customer_task_id);
CREATE INDEX IF NOT EXISTS idx_ar_action_logs_customer_task_id ON ar_action_logs(customer_task_id);

-- ============================================
-- 4. 历史数据迁移（可选，首次部署时执行）
-- 将现有进行中的单据级任务聚合为客户任务
-- ============================================

-- 创建临时函数来生成客户任务编号
CREATE OR REPLACE FUNCTION generate_customer_task_no()
RETURNS VARCHAR(50) AS $$
DECLARE
  date_str VARCHAR(8);
  seq_num INTEGER;
  task_no VARCHAR(50);
BEGIN
  date_str := to_char(CURRENT_DATE, 'YYYYMMDD');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(task_no, 16) AS INTEGER)), 0) + 1
  INTO seq_num
  FROM ar_customer_collection_tasks
  WHERE task_no LIKE 'AR-CUST-' || date_str || '-%';
  
  task_no := 'AR-CUST-' || date_str || '-' || lpad(seq_num::TEXT, 4, '0');
  RETURN task_no;
END;
$$ LANGUAGE plpgsql;

-- 注意：以下迁移语句需要在首次部署时根据实际情况执行
-- 这里只是示例，实际部署时需要评估是否需要迁移历史数据

-- INSERT INTO ar_customer_collection_tasks (
--   task_no, consumer_name, consumer_code, manager_users,
--   ar_ids, total_amount, bill_count, collector_id, collector_role,
--   assigned_at, deadline_at, status, result_type, latest_pay_date,
--   evidence_url, signature_data, escalate_reason, remark,
--   reviewed_by, review_status, review_comment, completed_at, created_at
-- )
-- SELECT 
--   generate_customer_task_no(),
--   r.consumer_name,
--   r.consumer_code,
--   r.manager_users,
--   ARRAY_AGG(t.ar_id),
--   SUM(r.left_amount),
--   COUNT(*),
--   t.collector_id,
--   t.collector_role,
--   MIN(t.assigned_at),
--   MAX(t.deadline_at),
--   CASE 
--     WHEN BOOL_AND(t.status = 'completed') THEN 'completed'
--     WHEN BOOL_OR(t.status = 'escalated') THEN 'escalated'
--     WHEN BOOL_OR(t.status = 'timeout') THEN 'timeout'
--     ELSE 'pending'
--   END,
--   CASE WHEN COUNT(DISTINCT t.result_type) = 1 THEN MAX(t.result_type) ELSE 'mixed' END,
--   MAX(t.latest_pay_date),
--   MAX(t.evidence_url),
--   MAX(t.signature_data),
--   MAX(t.escalate_reason),
--   MAX(t.remark),
--   MAX(t.reviewed_by),
--   MAX(t.review_status),
--   MAX(t.review_comment),
--   MAX(t.completed_at),
--   MIN(t.created_at)
-- FROM ar_collection_tasks t
-- JOIN ar_receivables r ON t.ar_id = r.id
-- WHERE t.status IN ('pending', 'in_progress', 'completed', 'timeout')
--   AND r.current_collector_id IS NOT NULL
-- GROUP BY r.consumer_name, r.consumer_code, r.manager_users, t.collector_id, t.collector_role;

-- 清理临时函数（迁移完成后执行）
-- DROP FUNCTION IF EXISTS generate_customer_task_no();
