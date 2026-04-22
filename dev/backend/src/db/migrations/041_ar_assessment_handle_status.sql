-- 催收考核管理重构迁移脚本
-- 1. 清空现有考核记录（从2026-04-23起重新开始）
-- 2. 新增处理情况字段（备注、处理人、处理时间）
-- 3. 为 operations_manager 分配管理权限

-- 1. 清空现有考核记录
DELETE FROM ar_assessment_records;

-- 2. 新增处理情况相关字段
ALTER TABLE ar_assessment_records
ADD COLUMN IF NOT EXISTS handle_remark TEXT,
ADD COLUMN IF NOT EXISTS handled_by INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS handled_at TIMESTAMP;

-- 3. 创建处理人索引
CREATE INDEX IF NOT EXISTS idx_ar_assessment_records_handled_by
ON ar_assessment_records(handled_by);

-- 4. 更新角色权限分配
-- 给运营支持中心经理（operations_manager）增加管理权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'operations_manager' AND p.code = 'finance:ar:penalty:write'
ON CONFLICT DO NOTHING;
