-- 022: 催收管理模块表结构
-- 执行时间: 2026-04-10
-- 说明: 创建催收管理相关表(任务、明细、延期记录、凭证文件、操作日志、法律催收进展)及权限数据

-- ============================================
-- 1. 催收任务主表(客户维度)
-- ============================================
CREATE TABLE IF NOT EXISTS ar_collection_tasks (
  id SERIAL PRIMARY KEY,
  task_no VARCHAR(32) UNIQUE NOT NULL,              -- 任务编号 AR202604080001
  consumer_code VARCHAR(64) NOT NULL,               -- 客户编码
  consumer_name VARCHAR(200),                        -- 客户名称
  manager_user_id INTEGER REFERENCES users(id),     -- 责任人ID
  manager_user_name VARCHAR(100),                    -- 责任人姓名
  total_amount DECIMAL(15,2),                       -- 欠款总额
  bill_count INTEGER DEFAULT 0,                     -- 单据数量
  status VARCHAR(30) NOT NULL,                      -- 任务状态
  current_handler_id INTEGER REFERENCES users(id),  -- 当前处理人
  current_handler_role VARCHAR(50),                 -- 当前处理角色

  -- 批次信息
  batch_type VARCHAR(20) DEFAULT 'daily',           -- 批次类型: daily/manual
  batch_date DATE NOT NULL,                         -- 批次日期
  priority VARCHAR(20),                             -- 优先级: high/medium/low

  -- 逾期相关
  first_overdue_date DATE,                          -- 首次逾期日期
  max_overdue_days INTEGER DEFAULT 0,               -- 最大逾期天数

  -- 升级相关
  escalation_level INTEGER DEFAULT 0,               -- 升级层级: 0=营销师, 1=主管, 2=财务
  escalation_count INTEGER DEFAULT 0,               -- 升级次数
  last_escalated_at TIMESTAMP,                      -- 最后升级时间
  last_escalated_by INTEGER REFERENCES users(id),   -- 最后升级操作人
  escalation_reason TEXT,                           -- 升级原因

  -- 延期相关
  extension_count INTEGER DEFAULT 0,                -- 延期次数(最大1)
  current_extension_id INTEGER,                     -- 当前延期记录ID
  extension_until DATE,                             -- 延期到期日(NULL表示未延期)
  can_extend BOOLEAN DEFAULT TRUE,                  -- 是否可再延期

  -- 催收统计
  collection_count INTEGER DEFAULT 0,               -- 催收次数
  last_collection_at TIMESTAMP,                     -- 最后催收时间

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 催收任务索引
CREATE INDEX IF NOT EXISTS idx_collection_tasks_consumer ON ar_collection_tasks(consumer_code);
CREATE INDEX IF NOT EXISTS idx_collection_tasks_status ON ar_collection_tasks(status);
CREATE INDEX IF NOT EXISTS idx_collection_tasks_handler ON ar_collection_tasks(current_handler_id);
CREATE INDEX IF NOT EXISTS idx_collection_tasks_escalation ON ar_collection_tasks(escalation_level);
CREATE INDEX IF NOT EXISTS idx_collection_tasks_extension ON ar_collection_tasks(extension_until);
CREATE INDEX IF NOT EXISTS idx_collection_tasks_batch ON ar_collection_tasks(batch_type, batch_date);
CREATE INDEX IF NOT EXISTS idx_collection_tasks_manager ON ar_collection_tasks(manager_user_id);

-- 更新时间触发器
DROP TRIGGER IF EXISTS update_ar_collection_tasks_updated_at ON ar_collection_tasks;
CREATE TRIGGER update_ar_collection_tasks_updated_at
    BEFORE UPDATE ON ar_collection_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 2. 催收明细表(单据维度)
-- ============================================
CREATE TABLE IF NOT EXISTS ar_collection_details (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES ar_collection_tasks(id) ON DELETE CASCADE,

  -- 单据信息(冗余便于查询)
  erp_bill_id VARCHAR(64),                          -- ERP单据ID
  bill_type_name VARCHAR(50),                       -- 单据类型名称
  total_amount DECIMAL(15,2),                       -- 单据总金额
  left_amount DECIMAL(15,2),                        -- 剩余未收金额
  bill_order_time TIMESTAMP,                        -- 单据日期
  expire_time TIMESTAMP,                            -- 到期日期
  overdue_days INTEGER,                             -- 逾期天数

  -- 处理状态
  status VARCHAR(30) NOT NULL DEFAULT 'pending',    -- pending/collecting/verifying/verified/difference/extended/closed
  process_type VARCHAR(30),                         -- 处理类型: verify/extension/difference
  process_amount DECIMAL(15,2),                     -- 处理金额
  process_at TIMESTAMP,                             -- 处理时间
  processed_by INTEGER REFERENCES users(id),        -- 处理人
  remark TEXT,                                      -- 备注

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 催收明细索引
CREATE INDEX IF NOT EXISTS idx_collection_details_task ON ar_collection_details(task_id);
CREATE INDEX IF NOT EXISTS idx_collection_details_status ON ar_collection_details(status);
CREATE INDEX IF NOT EXISTS idx_collection_details_erp_bill ON ar_collection_details(erp_bill_id);

-- ============================================
-- 3. 延期记录表
-- ============================================
CREATE TABLE IF NOT EXISTS ar_extension_records (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES ar_collection_tasks(id) ON DELETE CASCADE,
  detail_ids INTEGER[],                             -- 关联明细ID数组
  extension_days INTEGER NOT NULL,                  -- 延期天数
  extension_from DATE NOT NULL,                     -- 延期开始日期
  extension_until DATE NOT NULL,                    -- 延期至日期

  -- 凭证信息
  evidence_file_id INTEGER,                         -- 客户确认凭证(延迟引用ar_evidence_files)
  signature_url VARCHAR(500),                       -- 电子签名图片URL

  -- 审批信息
  status VARCHAR(20) DEFAULT 'active',              -- active / expired / cancelled
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expired_at TIMESTAMP                              -- 实际到期时间
);

-- 延期记录索引
CREATE INDEX IF NOT EXISTS idx_extension_records_task ON ar_extension_records(task_id);
CREATE INDEX IF NOT EXISTS idx_extension_records_status ON ar_extension_records(status);

-- ============================================
-- 4. 凭证文件表
-- ============================================
CREATE TABLE IF NOT EXISTS ar_evidence_files (
  id SERIAL PRIMARY KEY,
  task_id INTEGER REFERENCES ar_collection_tasks(id) ON DELETE CASCADE,

  -- 文件信息
  file_type VARCHAR(20) NOT NULL,                   -- evidence(差异凭证)/signature(签名)/customer_confirm(客户确认)
  file_name VARCHAR(200),                           -- 文件名
  file_path VARCHAR(500),                           -- 文件路径
  file_size INTEGER,                                -- 文件大小(字节)
  mime_type VARCHAR(100),                           -- MIME类型

  -- 上传信息
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 凭证文件索引
CREATE INDEX IF NOT EXISTS idx_evidence_files_task ON ar_evidence_files(task_id);
CREATE INDEX IF NOT EXISTS idx_evidence_files_type ON ar_evidence_files(file_type);

-- 添加延期记录表的凭证外键(延迟添加,因为ar_evidence_files在ar_extension_records之后创建)
ALTER TABLE ar_extension_records
  DROP CONSTRAINT IF EXISTS fk_extension_evidence;
ALTER TABLE ar_extension_records
  ADD CONSTRAINT fk_extension_evidence
  FOREIGN KEY (evidence_file_id) REFERENCES ar_evidence_files(id);

-- ============================================
-- 5. 操作日志表
-- ============================================
CREATE TABLE IF NOT EXISTS ar_collection_actions (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES ar_collection_tasks(id) ON DELETE CASCADE,
  detail_ids INTEGER[],                             -- 关联明细ID数组(可为空)

  -- 操作信息
  action_type VARCHAR(30) NOT NULL,                 -- collect/extension/difference/verify/escalate/close
  action_result VARCHAR(30),                        -- success/failed/pending
  remark TEXT,                                      -- 操作备注

  -- 操作人
  operator_id INTEGER REFERENCES users(id),
  operator_name VARCHAR(100),
  operator_role VARCHAR(50),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 操作日志索引
CREATE INDEX IF NOT EXISTS idx_collection_actions_task ON ar_collection_actions(task_id);
CREATE INDEX IF NOT EXISTS idx_collection_actions_type ON ar_collection_actions(action_type);

-- ============================================
-- 6. 法律催收进展表
-- ============================================
CREATE TABLE IF NOT EXISTS ar_legal_progress (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES ar_collection_tasks(id) ON DELETE CASCADE,
  action VARCHAR(30) NOT NULL,                      -- send_notice(发送催收函)/file_lawsuit(提起诉讼)/update_progress(更新进展)
  description TEXT,                                 -- 进展说明
  attachment_url TEXT,                              -- 附件URL
  operator_id INTEGER REFERENCES users(id),         -- 操作人
  created_at TIMESTAMP DEFAULT NOW()
);

-- 法律催收进展索引
CREATE INDEX IF NOT EXISTS idx_legal_progress_task ON ar_legal_progress(task_id);

-- ============================================
-- 7. 权限定义
-- ============================================
INSERT INTO permissions (code, name, resource_type, resource_key, action)
VALUES
  ('ar:collection:read', '查看催收任务', 'menu', '/ar-collection', 'read'),
  ('ar:collection:write', '催收操作', 'api', '/api/ar-collection', 'write'),
  ('ar:collection:verify', '核销确认', 'api', '/api/ar-collection/verify', 'verify'),
  ('ar:collection:escalate', '升级处理', 'api', '/api/ar-collection/escalate', 'escalate')
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- 8. 角色权限分配
-- ============================================

-- admin: 全部权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'admin'
  AND p.code IN ('ar:collection:read', 'ar:collection:write', 'ar:collection:verify', 'ar:collection:escalate')
ON CONFLICT DO NOTHING;

-- manager: read + write + escalate
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'manager'
  AND p.code IN ('ar:collection:read', 'ar:collection:write', 'ar:collection:escalate')
ON CONFLICT DO NOTHING;

-- finance_staff: read + write
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'finance_staff'
  AND p.code IN ('ar:collection:read', 'ar:collection:write')
ON CONFLICT DO NOTHING;

-- cashier: read + verify
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'cashier'
  AND p.code IN ('ar:collection:read', 'ar:collection:verify')
ON CONFLICT DO NOTHING;

-- marketing_supervisor: read + write + escalate
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'marketing_supervisor'
  AND p.code IN ('ar:collection:read', 'ar:collection:write', 'ar:collection:escalate')
ON CONFLICT DO NOTHING;

-- operator(营销师): read + write + escalate
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'operator'
  AND p.code IN ('ar:collection:read', 'ar:collection:write', 'ar:collection:escalate')
ON CONFLICT DO NOTHING;
