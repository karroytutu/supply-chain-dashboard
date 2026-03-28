-- 钉钉登录认证系统数据库表结构
-- 数据库: xly_dashboard

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  dingtalk_user_id VARCHAR(64) UNIQUE NOT NULL,
  dingtalk_union_id VARCHAR(64) UNIQUE,
  name VARCHAR(100) NOT NULL,
  avatar VARCHAR(500),
  mobile VARCHAR(20),
  email VARCHAR(100),
  department_id VARCHAR(64),
  department_name VARCHAR(100),
  position VARCHAR(100),
  status SMALLINT DEFAULT 1,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 角色表
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500),
  is_system BOOLEAN DEFAULT FALSE,
  status SMALLINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 权限表
CREATE TABLE IF NOT EXISTS permissions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_key VARCHAR(200) NOT NULL,
  action VARCHAR(20) NOT NULL,
  parent_id INTEGER REFERENCES permissions(id),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 用户角色关联表
CREATE TABLE IF NOT EXISTS user_roles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, role_id)
);

-- 角色权限关联表
CREATE TABLE IF NOT EXISTS role_permissions (
  id SERIAL PRIMARY KEY,
  role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(role_id, permission_id)
);

-- 登录日志表
CREATE TABLE IF NOT EXISTS login_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  login_type VARCHAR(20) NOT NULL,
  ip_address VARCHAR(50),
  user_agent TEXT,
  login_at TIMESTAMP DEFAULT NOW(),
  status SMALLINT NOT NULL,
  failure_reason VARCHAR(200)
);

-- 创建索引
CREATE INDEX idx_users_dingtalk_user_id ON users(dingtalk_user_id);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_roles_code ON roles(code);
CREATE INDEX idx_permissions_code ON permissions(code);
CREATE INDEX idx_permissions_parent_id ON permissions(parent_id);
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX idx_login_logs_user_id ON login_logs(user_id);
CREATE INDEX idx_login_logs_login_at ON login_logs(login_at);

-- 初始化系统角色
INSERT INTO roles (code, name, description, is_system) VALUES
  ('admin', '系统管理员', '拥有系统全部权限', TRUE),
  ('manager', '供应链经理', '管理数据和报表', TRUE),
  ('operator', '运营人员', '日常数据操作', TRUE),
  ('viewer', '只读用户', '仅查看权限', TRUE),
  ('procurement_manager', '采购主管', '负责临期退货确认和ERP退货单填写', TRUE),
  ('warehouse_manager', '仓储主管', '负责仓储退货执行', TRUE)
ON CONFLICT (code) DO NOTHING;

-- 初始化基础权限
INSERT INTO permissions (code, name, resource_type, resource_key, action, sort_order) VALUES
  ('dashboard:view:read', '查看仪表盘', 'menu', '/dashboard', 'read', 1),
  ('dashboard:export:write', '导出数据', 'api', '/api/dashboard/export', 'write', 2),
  ('system:user:read', '查看用户', 'menu', '/system/users', 'read', 100),
  ('system:user:write', '编辑用户', 'api', '/api/users', 'write', 101),
  ('system:user:delete', '删除用户', 'api', '/api/users', 'delete', 102),
  ('system:role:read', '查看角色', 'menu', '/system/roles', 'read', 110),
  ('system:role:write', '编辑角色', 'api', '/api/roles', 'write', 111),
  ('system:permission:read', '查看权限', 'menu', '/system/permissions', 'read', 120),
  ('system:permission:write', '编辑权限', 'api', '/api/permissions', 'write', 121);

-- 为admin角色分配所有权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions;

-- 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为users表创建更新时间触发器
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 为roles表创建更新时间触发器
DROP TRIGGER IF EXISTS update_roles_updated_at ON roles;
CREATE TRIGGER update_roles_updated_at
    BEFORE UPDATE ON roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
