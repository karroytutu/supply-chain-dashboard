-- 催收考核管理模块数据库迁移
-- 创建考核记录表、添加考核计时字段、定义权限

-- 1. 创建考核记录表
CREATE TABLE ar_assessment_records (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES ar_collection_tasks(id) ON DELETE CASCADE,
  assessment_tier VARCHAR(20) NOT NULL,  -- 'tier1' | 'tier2' | 'tier3'
  assessment_user_id INTEGER NOT NULL REFERENCES users(id),
  assessment_user_name VARCHAR(100),
  assessment_role VARCHAR(30) NOT NULL,  -- 'marketer' | 'marketing_supervisor'
  base_amount DECIMAL(15,2),            -- 任务欠款总额(tier3时使用)
  overdue_days INTEGER NOT NULL,         -- 从assessment_start_time起算的天数
  penalty_amount DECIMAL(15,2) NOT NULL, -- 本条考核金额
  assessment_rule_snapshot JSONB,        -- 规则快照
  status VARCHAR(20) DEFAULT 'pending',  -- pending/confirmed/cancelled
  calculated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_id, assessment_tier, assessment_user_id)
);

-- 索引
CREATE INDEX idx_ar_assessment_records_task_id ON ar_assessment_records(task_id);
CREATE INDEX idx_ar_assessment_records_user_id ON ar_assessment_records(assessment_user_id);
CREATE INDEX idx_ar_assessment_records_status ON ar_assessment_records(status);
CREATE INDEX idx_ar_assessment_records_tier ON ar_assessment_records(assessment_tier);
CREATE INDEX idx_ar_assessment_records_created_at ON ar_assessment_records(created_at);

-- updated_at 自动更新触发器
CREATE OR REPLACE FUNCTION update_ar_assessment_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ar_assessment_records_updated_at
  BEFORE UPDATE ON ar_assessment_records
  FOR EACH ROW
  EXECUTE FUNCTION update_ar_assessment_records_updated_at();

-- 2. 为催收任务表添加考核计时起点字段
ALTER TABLE ar_collection_tasks
ADD COLUMN IF NOT EXISTS assessment_start_time TIMESTAMP;

-- 初始化现有活跃任务的assessment_start_time
-- 正在催收中的任务：取创建时间
UPDATE ar_collection_tasks SET assessment_start_time = created_at
WHERE status IN ('collecting','escalated','difference_processing')
  AND assessment_start_time IS NULL;

-- 延期中的任务：取延期到期时间
UPDATE ar_collection_tasks SET assessment_start_time = extension_until
WHERE status = 'extension'
  AND assessment_start_time IS NULL AND extension_until IS NOT NULL;

-- 3. 权限定义
INSERT INTO permissions (code, name, resource_type, resource_key, action) VALUES
  ('finance:ar:penalty:read', '查看催收考核', 'menu', '/collection/assessment', 'read'),
  ('finance:ar:penalty:write', '管理催收考核', 'api', '/api/ar-assessment', 'write')
ON CONFLICT (code) DO NOTHING;

-- 角色分配
-- admin、往来会计：读写权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('admin', 'current_accountant') AND p.code IN ('finance:ar:penalty:read', 'finance:ar:penalty:write')
ON CONFLICT DO NOTHING;

-- 营销主管、运营支持中心经理：只读权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('marketing_manager', 'operations_manager') AND p.code = 'finance:ar:penalty:read'
ON CONFLICT DO NOTHING;
