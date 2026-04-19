-- 钉钉用户与组织架构同步相关表结构
-- 数据库: xly_dashboard

-- 钉钉部门表
CREATE TABLE IF NOT EXISTS dingtalk_departments (
  id SERIAL PRIMARY KEY,
  dingtalk_dept_id VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  parent_id VARCHAR(64),
  auto_add_user BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_dingtalk_depts_dingtalk_id ON dingtalk_departments(dingtalk_dept_id);
CREATE INDEX idx_dingtalk_depts_parent ON dingtalk_departments(parent_id);

-- 用户-部门关联表（支持多部门）
CREATE TABLE IF NOT EXISTS user_departments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  dept_id INTEGER REFERENCES dingtalk_departments(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, dept_id)
);

CREATE INDEX idx_user_departments_user ON user_departments(user_id);
CREATE INDEX idx_user_departments_dept ON user_departments(dept_id);

-- users 表新增同步相关字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS dingtalk_last_synced_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS dingtalk_sync_hash VARCHAR(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_ids TEXT;

-- 钉钉同步日志表
CREATE TABLE IF NOT EXISTS dingtalk_sync_logs (
  id SERIAL PRIMARY KEY,
  sync_type VARCHAR(20) NOT NULL,
  trigger_type VARCHAR(20) NOT NULL,
  triggered_by INTEGER REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  total_dingtalk_users INTEGER DEFAULT 0,
  total_local_users INTEGER DEFAULT 0,
  users_created INTEGER DEFAULT 0,
  users_updated INTEGER DEFAULT 0,
  users_disabled INTEGER DEFAULT 0,
  users_unchanged INTEGER DEFAULT 0,
  depts_created INTEGER DEFAULT 0,
  depts_updated INTEGER DEFAULT 0,
  depts_synced INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration_ms INTEGER
);

CREATE INDEX idx_sync_logs_status ON dingtalk_sync_logs(status);
CREATE INDEX idx_sync_logs_started ON dingtalk_sync_logs(started_at DESC);

-- 为 dingtalk_departments 创建更新时间触发器
DROP TRIGGER IF EXISTS update_dingtalk_depts_updated_at ON dingtalk_departments;
CREATE TRIGGER update_dingtalk_depts_updated_at
    BEFORE UPDATE ON dingtalk_departments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 新增同步管理权限
INSERT INTO permissions (code, name, resource_type, resource_key, action, sort_order) VALUES
  ('system:sync:read', '查看同步日志', 'menu', '/system/users', 'read', 130),
  ('system:sync:write', '执行同步操作', 'api', '/api/dingtalk-sync', 'write', 131)
ON CONFLICT (code) DO NOTHING;

-- 为 admin 和 manager 角色分配同步权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('admin', 'manager') AND p.code IN ('system:sync:read', 'system:sync:write')
ON CONFLICT DO NOTHING;
