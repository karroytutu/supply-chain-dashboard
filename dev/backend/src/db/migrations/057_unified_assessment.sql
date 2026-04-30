-- =====================================================
-- 057: 统一考核管理 - 创建新表 + 数据迁移 + 权限
-- =====================================================

-- 1. 创建统一考核记录表
CREATE TABLE IF NOT EXISTS assessment_records (
  id                   SERIAL PRIMARY KEY,
  category             VARCHAR(30) NOT NULL,      -- ar_collection | return_order
  rule_type            VARCHAR(50) NOT NULL,      -- tier1/tier2/tier3 | procurement_confirm_timeout/...
  source_type          VARCHAR(50) NOT NULL,      -- ar_collection_task | expiring_return_order
  source_id            INTEGER NOT NULL,
  source_no            VARCHAR(50),               -- 冗余: task_no / return_no
  source_name          VARCHAR(200),              -- 冗余: consumer_name / goods_name
  assessment_user_id   INTEGER NOT NULL REFERENCES users(id),
  assessment_user_name VARCHAR(100),
  assessment_role      VARCHAR(30) NOT NULL,
  base_amount          DECIMAL(15,2),
  penalty_rate         DECIMAL(10,2),             -- 每天考核金额(退货按天累计用)
  overdue_days         INTEGER DEFAULT 0,
  penalty_amount       DECIMAL(15,2) NOT NULL,
  status               VARCHAR(20) DEFAULT 'pending',
  handle_remark        TEXT,
  handled_by           INTEGER REFERENCES users(id),
  handled_at           TIMESTAMP,
  oa_instance_id       INTEGER,                   -- 关联的OA审批实例（不加外键约束，因为可能OA表还不存在相应记录）
  appeal_reason        TEXT,                      -- 申诉理由
  appeal_submitted_at  TIMESTAMP,                 -- 申诉提交时间
  rule_snapshot        JSONB,
  calculated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_id, source_type, rule_type, assessment_user_id)
);

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_assessment_records_category ON assessment_records(category);
CREATE INDEX IF NOT EXISTS idx_assessment_records_status ON assessment_records(status);
CREATE INDEX IF NOT EXISTS idx_assessment_records_source ON assessment_records(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_assessment_records_user ON assessment_records(assessment_user_id);
CREATE INDEX IF NOT EXISTS idx_assessment_records_created ON assessment_records(created_at);
CREATE INDEX IF NOT EXISTS idx_assessment_records_category_status ON assessment_records(category, status);
CREATE INDEX IF NOT EXISTS idx_assessment_records_oa_instance ON assessment_records(oa_instance_id);
CREATE INDEX IF NOT EXISTS idx_assessment_records_rule_type ON assessment_records(rule_type);

-- 3. 从 ar_assessment_records 迁移数据
-- 重要：旧表每条记录包含 marketer + supervisor，需拆分为两条记录

-- 3a. 插入 marketer 记录（仅当 marketer_id 不为空时）
INSERT INTO assessment_records (
  category, rule_type, source_type, source_id, source_no, source_name,
  assessment_user_id, assessment_user_name, assessment_role,
  base_amount, penalty_rate, overdue_days, penalty_amount,
  status, handle_remark, handled_by, handled_at,
  rule_snapshot, calculated_at, created_at, updated_at
)
SELECT
  'ar_collection',
  CASE tier
    WHEN 1 THEN 'tier1'
    WHEN 2 THEN 'tier2'
    WHEN 3 THEN 'tier3'
  END,
  'ar_collection_task',
  task_id,
  task_no,
  consumer_name,
  marketer_id,
  marketer_name,
  'marketer',
  NULL,  -- base_amount (催收非比例计算的 tier 不需要)
  NULL,  -- penalty_rate
  overdue_days,
  marketer_amount,
  CASE status
    WHEN 'handled' THEN 'confirmed'
    WHEN 'skipped' THEN 'cancelled'
    ELSE status  -- 'pending' stays 'pending'
  END,
  handle_remark,
  handled_by,
  handled_at,
  NULL,  -- rule_snapshot
  calculated_at,
  created_at,
  updated_at
FROM ar_assessment_records
WHERE marketer_id IS NOT NULL;

-- 3b. 插入 supervisor 记录（仅当 supervisor_id 不为空时）
INSERT INTO assessment_records (
  category, rule_type, source_type, source_id, source_no, source_name,
  assessment_user_id, assessment_user_name, assessment_role,
  base_amount, penalty_rate, overdue_days, penalty_amount,
  status, handle_remark, handled_by, handled_at,
  rule_snapshot, calculated_at, created_at, updated_at
)
SELECT
  'ar_collection',
  CASE tier
    WHEN 1 THEN 'tier1'
    WHEN 2 THEN 'tier2'
    WHEN 3 THEN 'tier3'
  END,
  'ar_collection_task',
  task_id,
  task_no,
  consumer_name,
  supervisor_id,
  supervisor_name,
  'marketing_supervisor',
  NULL,
  NULL,
  overdue_days,
  supervisor_amount,
  CASE status
    WHEN 'handled' THEN 'confirmed'
    WHEN 'skipped' THEN 'cancelled'
    ELSE status
  END,
  handle_remark,
  handled_by,
  handled_at,
  NULL,
  calculated_at,
  created_at,
  updated_at
FROM ar_assessment_records
WHERE supervisor_id IS NOT NULL;

-- 4. 从 return_penalty_records 迁移数据
INSERT INTO assessment_records (
  category, rule_type, source_type, source_id, source_no, source_name,
  assessment_user_id, assessment_user_name, assessment_role,
  base_amount, penalty_rate, overdue_days, penalty_amount,
  status, handle_remark, handled_by, handled_at,
  oa_instance_id, appeal_reason, appeal_submitted_at,
  rule_snapshot, calculated_at, created_at, updated_at
)
SELECT
  'return_order',
  rule_type,
  'expiring_return_order',
  return_order_id,
  return_no,
  goods_name,
  COALESCE(responsible_user_id, 0),  -- 必须非空，0 表示未分配
  responsible_user_name,
  responsible_role,
  base_amount,
  penalty_rate,
  overdue_days,
  penalty_amount,
  status,   -- pending/confirmed/cancelled/appealed 直接保留
  handle_remark,
  handled_by,
  handled_at,
  NULL,     -- oa_instance_id（旧系统无OA关联）
  NULL,     -- appeal_reason
  NULL,     -- appeal_submitted_at
  rule_snapshot,
  calculated_at,
  created_at,
  updated_at
FROM return_penalty_records
WHERE responsible_user_id IS NOT NULL;

-- 5. 重命名旧表（保留回退能力）
ALTER TABLE IF EXISTS ar_assessment_records RENAME TO ar_assessment_records_deprecated;
ALTER TABLE IF EXISTS return_penalty_records RENAME TO return_penalty_records_deprecated;

-- 6. 新增权限种子数据
INSERT INTO permissions (code, name, resource_type, resource_key, action)
VALUES
  ('assessment:read', '查看考核记录', 'menu', '/assessment', 'read'),
  ('assessment:write', '管理考核记录', 'api', '/api/assessment', 'write')
ON CONFLICT (code) DO NOTHING;

-- 7. 为相关角色分配新权限
-- admin 角色获得所有权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'admin' AND p.code IN ('assessment:read', 'assessment:write')
ON CONFLICT DO NOTHING;

-- manager 角色获得读写权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'manager' AND p.code IN ('assessment:read', 'assessment:write')
ON CONFLICT DO NOTHING;

-- operator 角色获得读权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'operator' AND p.code IN ('assessment:read')
ON CONFLICT DO NOTHING;

-- 拥有旧权限 finance:ar:penalty 的角色也获得新权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id 
FROM role_permissions rp
JOIN permissions old_p ON rp.permission_id = old_p.id AND old_p.code = 'finance:ar:penalty'
CROSS JOIN permissions p
WHERE p.code IN ('assessment:read', 'assessment:write')
ON CONFLICT DO NOTHING;

-- 拥有旧权限 return:penalty:read 的角色也获得新读权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id 
FROM role_permissions rp
JOIN permissions old_p ON rp.permission_id = old_p.id AND old_p.code = 'return:penalty:read'
CROSS JOIN permissions p
WHERE p.code = 'assessment:read'
ON CONFLICT DO NOTHING;

-- 拥有旧权限 return:penalty:write 的角色也获得新写权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id 
FROM role_permissions rp
JOIN permissions old_p ON rp.permission_id = old_p.id AND old_p.code = 'return:penalty:write'
CROSS JOIN permissions p
WHERE p.code = 'assessment:write'
ON CONFLICT DO NOTHING;
