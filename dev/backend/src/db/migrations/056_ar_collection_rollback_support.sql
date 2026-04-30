-- 催收任务退回功能支持
-- 1. 添加升级前状态列，用于退回时恢复正确状态
-- 2. 新增退回权限并分配给相关角色

-- 添加升级前状态列
ALTER TABLE ar_collection_tasks ADD COLUMN pre_escalation_status VARCHAR(30);
COMMENT ON COLUMN ar_collection_tasks.pre_escalation_status IS '升级前的任务状态，退回时恢复到此状态';

-- 回填历史数据：escalation_level > 0 的任务，默认设为 collecting（最常见场景）
-- 注意：对于升级后状态已流转的历史任务（如 escalated → verified），'collecting' 是近似值，
-- 但退回操作仅允许 status='escalated' 的任务，所以不影响业务逻辑
UPDATE ar_collection_tasks SET pre_escalation_status = 'collecting'
WHERE escalation_level > 0 AND pre_escalation_status IS NULL;

-- 新增退回权限
INSERT INTO permissions (code, name, resource_type, resource_key, action)
VALUES ('ar:collection:rollback', '催收退回', 'api', '/api/ar-collection/tasks/:id/rollback', 'rollback')
ON CONFLICT (code) DO NOTHING;

-- 为相关角色分配退回权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('admin', 'marketing_manager', 'marketing_supervisor', 'current_accountant', 'finance_staff', 'manager')
  AND p.code = 'ar:collection:rollback'
ON CONFLICT DO NOTHING;
