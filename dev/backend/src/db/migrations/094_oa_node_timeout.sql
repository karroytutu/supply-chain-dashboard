-- OA审批节点时限通用能力
-- 数据库: xly_dashboard
-- 依赖: 092_org_structure_schema.sql (users.manager_userid)

-- =====================================================
-- 1. oa_approval_nodes 扩展字段
-- =====================================================

ALTER TABLE oa_approval_nodes ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMP;
ALTER TABLE oa_approval_nodes ADD COLUMN IF NOT EXISTS timeout_config JSONB;
ALTER TABLE oa_approval_nodes ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMP;
ALTER TABLE oa_approval_nodes ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;
ALTER TABLE oa_approval_nodes ADD COLUMN IF NOT EXISTS cc_supervisor_at TIMESTAMP;

COMMENT ON COLUMN oa_approval_nodes.deadline_at IS '节点截止时间（创建时从 timeout_config.durationMinutes 计算）';
COMMENT ON COLUMN oa_approval_nodes.timeout_config IS '时限配置快照（创建时从 WorkflowNodeDef.timeout 复制）';
COMMENT ON COLUMN oa_approval_nodes.last_reminder_at IS '最后催办时间';
COMMENT ON COLUMN oa_approval_nodes.reminder_count IS '已催办次数';
COMMENT ON COLUMN oa_approval_nodes.cc_supervisor_at IS '首次抄送上级时间';

-- 催办扫描索引：仅命中 pending + 有 deadline 的节点
CREATE INDEX IF NOT EXISTS idx_oa_nodes_deadline_overdue
  ON oa_approval_nodes(instance_id, deadline_at)
  WHERE status = 'pending' AND deadline_at IS NOT NULL;

-- =====================================================
-- 2. 催办历史日志表
-- =====================================================

CREATE TABLE IF NOT EXISTS oa_node_timeout_logs (
    id SERIAL PRIMARY KEY,
    node_id INTEGER NOT NULL REFERENCES oa_approval_nodes(id) ON DELETE CASCADE,
    instance_id INTEGER NOT NULL REFERENCES oa_approval_instances(id) ON DELETE CASCADE,
    log_type VARCHAR(30) NOT NULL,
    recipient_user_id INTEGER REFERENCES users(id),
    recipient_user_name VARCHAR(100),
    is_supervisor_cc BOOLEAN DEFAULT FALSE,
    message_content JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE oa_node_timeout_logs IS 'OA节点超时催办/抄送历史日志';
COMMENT ON COLUMN oa_node_timeout_logs.log_type IS '日志类型: reminder(催办) / cc_supervisor(抄送上级) / manual_remind(手动催办)';

CREATE INDEX IF NOT EXISTS idx_oa_timeout_logs_node ON oa_node_timeout_logs(node_id);
CREATE INDEX IF NOT EXISTS idx_oa_timeout_logs_instance ON oa_node_timeout_logs(instance_id);
