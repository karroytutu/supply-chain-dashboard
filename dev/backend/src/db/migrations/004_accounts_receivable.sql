-- 应收账款管理功能数据库迁移
-- 数据库: xly_dashboard

-- ============================================
-- 1. 应收账款主表（从ERP同步）
-- ============================================
CREATE TABLE IF NOT EXISTS ar_receivables (
  id SERIAL PRIMARY KEY,
  erp_bill_id VARCHAR(100) UNIQUE NOT NULL,          -- ERP单据ID（唯一）
  consumer_name VARCHAR(200) NOT NULL,                -- 客户名称
  consumer_code VARCHAR(100),                         -- 客户编码
  salesman_name VARCHAR(100),                         -- 业务员名称
  dept_name VARCHAR(100),                             -- 部门名称
  manager_users VARCHAR(200),                         -- 所属营销（来自ERP managerUsers字段）
  settle_method INT,                                  -- 结算方式: 1=现结, 2=挂账
  max_debt_days INT,                                  -- 最大欠款天数: 现结默认7天，挂账取客户档案
  total_amount DECIMAL(15,2) DEFAULT 0,               -- 总金额
  left_amount DECIMAL(15,2) DEFAULT 0,                -- 欠款余额
  paid_amount DECIMAL(15,2) DEFAULT 0,                -- 已付金额
  write_off_amount DECIMAL(15,2) DEFAULT 0,           -- 核销金额
  bill_order_time TIMESTAMP,                          -- 单据日期
  expire_day INTEGER,                                 -- ERP过期天数（numeric）
  last_pay_day TIMESTAMP,                             -- 最后付款日
  due_date TIMESTAMP,                                 -- 计算的到期日（bill_order_time + max_debt_days）
  ar_status VARCHAR(30) DEFAULT 'synced',             -- 状态: synced/pre_warning_5/pre_warning_2/overdue/collecting/escalated/resolved/written_off
  current_collector_id INTEGER REFERENCES users(id),  -- 当前催收人
  collector_level VARCHAR(20),                        -- 催收层级: marketing/supervisor/finance
  notification_status VARCHAR(30) DEFAULT 'none',     -- 推送状态: none/pre_warn_5_sent/pre_warn_2_sent/overdue_sent/escalate_sent
  last_notified_at TIMESTAMP,                         -- 最后推送时间
  last_synced_at TIMESTAMP DEFAULT NOW(),             -- 最后同步时间
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 应收账款主表索引
CREATE INDEX IF NOT EXISTS idx_ar_receivables_ar_status ON ar_receivables(ar_status);
CREATE INDEX IF NOT EXISTS idx_ar_receivables_consumer_code ON ar_receivables(consumer_code);
CREATE INDEX IF NOT EXISTS idx_ar_receivables_due_date ON ar_receivables(due_date);
CREATE INDEX IF NOT EXISTS idx_ar_receivables_current_collector_id ON ar_receivables(current_collector_id);
CREATE INDEX IF NOT EXISTS idx_ar_receivables_status_due_date ON ar_receivables(ar_status, due_date);

-- 为表添加更新时间触发器
DROP TRIGGER IF EXISTS update_ar_receivables_updated_at ON ar_receivables;
CREATE TRIGGER update_ar_receivables_updated_at
    BEFORE UPDATE ON ar_receivables
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. 催收任务表
-- ============================================
CREATE TABLE IF NOT EXISTS ar_collection_tasks (
  id SERIAL PRIMARY KEY,
  ar_id INTEGER NOT NULL REFERENCES ar_receivables(id) ON DELETE CASCADE,
  task_no VARCHAR(50) UNIQUE NOT NULL,                -- 任务编号
  collector_id INTEGER NOT NULL REFERENCES users(id), -- 催收人
  collector_role VARCHAR(20) NOT NULL,                -- 催收角色: marketing/supervisor/finance
  assigned_at TIMESTAMP DEFAULT NOW(),                -- 分配时间
  deadline_at TIMESTAMP NOT NULL,                     -- 截止时间（assigned_at + 3天）
  status VARCHAR(20) DEFAULT 'pending',               -- 状态: pending/in_progress/completed/escalated/timeout
  result_type VARCHAR(30),                            -- 结果类型: customer_delay/guarantee_delay/paid_off/escalate
  latest_pay_date TIMESTAMP,                          -- 延期最迟回款日期
  evidence_type VARCHAR(20),                          -- 凭证类型: customer_proof/signature
  evidence_url TEXT,                                  -- 凭证图片路径
  signature_data TEXT,                                -- 签名JSON数据
  escalate_reason TEXT,                               -- 升级理由
  remark TEXT,                                        -- 备注
  reviewed_by INTEGER REFERENCES users(id),           -- 审核人
  review_status VARCHAR(20),                          -- 审核状态: pending/approved/rejected
  review_comment TEXT,                                -- 审核意见
  completed_at TIMESTAMP,                             -- 完成时间
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 催收任务表索引
CREATE INDEX IF NOT EXISTS idx_ar_collection_tasks_ar_id ON ar_collection_tasks(ar_id);
CREATE INDEX IF NOT EXISTS idx_ar_collection_tasks_collector_id ON ar_collection_tasks(collector_id);
CREATE INDEX IF NOT EXISTS idx_ar_collection_tasks_status ON ar_collection_tasks(status);
CREATE INDEX IF NOT EXISTS idx_ar_collection_tasks_collector_status ON ar_collection_tasks(collector_id, status);

-- 为催收任务表添加更新时间触发器
DROP TRIGGER IF EXISTS update_ar_collection_tasks_updated_at ON ar_collection_tasks;
CREATE TRIGGER update_ar_collection_tasks_updated_at
    BEFORE UPDATE ON ar_collection_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 3. 考核记录表
-- ============================================
CREATE TABLE IF NOT EXISTS ar_penalty_records (
  id SERIAL PRIMARY KEY,
  ar_id INTEGER NOT NULL REFERENCES ar_receivables(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES ar_collection_tasks(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  penalty_level VARCHAR(20) DEFAULT 'none',           -- 考核级别: none/base/double/full
  overdue_days INTEGER DEFAULT 0,                     -- 超时天数
  penalty_amount DECIMAL(15,2) DEFAULT 0,             -- 考核金额
  penalty_rule JSONB,                                 -- 规则快照
  status VARCHAR(20) DEFAULT 'pending',               -- 状态: pending/confirmed/appealed/cancelled
  created_at TIMESTAMP DEFAULT NOW()
);

-- 考核记录表索引
CREATE INDEX IF NOT EXISTS idx_ar_penalty_records_user_id ON ar_penalty_records(user_id);
CREATE INDEX IF NOT EXISTS idx_ar_penalty_records_ar_id ON ar_penalty_records(ar_id);

-- ============================================
-- 4. 操作日志表
-- ============================================
CREATE TABLE IF NOT EXISTS ar_action_logs (
  id SERIAL PRIMARY KEY,
  ar_id INTEGER NOT NULL REFERENCES ar_receivables(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES ar_collection_tasks(id),
  action_type VARCHAR(30) NOT NULL,                   -- 操作类型: sync/pre_warn_5/pre_warn_2/overdue_notify/assign_collector/submit_result/review/escalate/resolve/penalty/payment_confirmed/guarantee_notify/daily_summary
  action_by INTEGER REFERENCES users(id),
  action_data JSONB,                                  -- 操作详情
  remark TEXT,                                         -- 备注
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 5. 通知记录表
-- ============================================
CREATE TABLE IF NOT EXISTS ar_notification_records (
  id SERIAL PRIMARY KEY,
  ar_ids INTEGER[] NOT NULL,                          -- 关联的应收账款ID数组（支持合并推送）
  notification_type VARCHAR(30) NOT NULL,             -- 通知类型: pre_warn_5/pre_warn_2/overdue_collect/timeout_penalty/escalate/auto_escalate/pending_review/review_result/payment_confirmed/guarantee_notify/daily_summary
  recipient_id INTEGER NOT NULL REFERENCES users(id),
  recipient_name VARCHAR(100),                        -- 接收人姓名
  consumer_name VARCHAR(200),                         -- 客户名称（用于合并分组）
  bill_count INTEGER DEFAULT 1,                       -- 涉及单据数量
  message_content TEXT,                               -- 实际发送内容快照
  status VARCHAR(20) DEFAULT 'pending',               -- 推送状态: pending/sent/failed
  sent_at TIMESTAMP,                                  -- 发送时间
  dingtalk_task_id VARCHAR(100),                      -- 钉钉任务ID
  error_message TEXT,                                 -- 错误信息
  created_at TIMESTAMP DEFAULT NOW()
);

-- 通知记录表索引
CREATE INDEX IF NOT EXISTS idx_ar_notification_records_notification_type ON ar_notification_records(notification_type);
CREATE INDEX IF NOT EXISTS idx_ar_notification_records_recipient_id ON ar_notification_records(recipient_id);
CREATE INDEX IF NOT EXISTS idx_ar_notification_records_recipient_type_created ON ar_notification_records(recipient_id, notification_type, created_at);

-- ============================================
-- 6. 用户历史签名表
-- ============================================
CREATE TABLE IF NOT EXISTS ar_user_signatures (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signature_data TEXT NOT NULL,                       -- 签名Base64数据
  is_default BOOLEAN DEFAULT FALSE,                   -- 是否默认签名
  created_at TIMESTAMP DEFAULT NOW()
);

-- 用户历史签名表索引
CREATE INDEX IF NOT EXISTS idx_ar_user_signatures_user_id ON ar_user_signatures(user_id);

-- ============================================
-- 权限初始化
-- ============================================

-- 新增角色
INSERT INTO roles (code, name, description, is_system) VALUES 
  ('finance_staff', '财务人员', '负责应收账款财务审核', true),
  ('cashier', '出纳', '负责回款核实确认', true),
  ('marketing_supervisor', '营销主管', '负责催收升级处理', true)
ON CONFLICT (code) DO NOTHING;

-- 新增权限
INSERT INTO permissions (code, name, resource_type, resource_key, action, sort_order) VALUES
  ('finance:ar:read', '应收账款查看', 'menu', '/finance/ar', 'read', 200),
  ('finance:ar:collect', '应收账款催收', 'api', '/api/finance/ar/collect', 'write', 201),
  ('finance:ar:review', '应收账款审核', 'api', '/api/finance/ar/review', 'write', 202),
  ('finance:ar:penalty', '考核管理', 'api', '/api/finance/ar/penalty', 'write', 203),
  ('finance:ar:manage', '应收账款管理', 'api', '/api/ar/sync', 'write', 204)
ON CONFLICT (code) DO NOTHING;
