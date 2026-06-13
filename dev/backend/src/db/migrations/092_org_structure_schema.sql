-- 组织架构模块：新增直属主管和部门负责人字段
-- 数据库: xly_dashboard
--
-- ❗ 部署顺序说明：
--   本 migration 必须在钉钉用户同步之前执行。
--   computeSyncHash 已新增 manager_userid + leader_in_dept 参与哈希，
--   执行本 migration 后需清空现有用户的 sync hash，让下次同步自然更新：

-- users 表新增 manager_userid：存储钉钉直属主管的 dingtalk_user_id
ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_userid VARCHAR(64);

-- user_departments 表新增 is_leader：标记该用户是否为该部门的负责人
ALTER TABLE user_departments ADD COLUMN IF NOT EXISTS is_leader BOOLEAN DEFAULT FALSE;

-- 为 manager_userid 创建索引（用于查询"谁是某人的下属"）
CREATE INDEX IF NOT EXISTS idx_users_manager_userid ON users(manager_userid) WHERE manager_userid IS NOT NULL;

-- 为 is_leader 创建索引
CREATE INDEX IF NOT EXISTS idx_user_departments_is_leader ON user_departments(is_leader) WHERE is_leader = TRUE;

-- 清空 sync hash，让下次钉钉同步自动补全 manager_userid 和 is_leader
UPDATE users SET dingtalk_sync_hash = NULL WHERE dingtalk_sync_hash IS NOT NULL;
