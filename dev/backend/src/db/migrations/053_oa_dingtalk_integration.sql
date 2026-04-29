-- =====================================================
-- OA审批钉钉深度集成：新增操作Token表和通知TaskId映射表
-- =====================================================

-- 表1: 一次性操作Token
-- 用于钉钉ActionCard按钮的URL中嵌入的短期一次性Token
CREATE TABLE IF NOT EXISTS oa_action_tokens (
  id SERIAL PRIMARY KEY,
  token VARCHAR(64) UNIQUE NOT NULL,
  instance_id INTEGER NOT NULL REFERENCES oa_approval_instances(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL,  -- 'approve' / 'view'
  node_order INTEGER NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'active',  -- active / used / expired
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_oa_action_tokens_token ON oa_action_tokens(token);
CREATE INDEX idx_oa_action_tokens_instance ON oa_action_tokens(instance_id);
CREATE INDEX idx_oa_action_tokens_status ON oa_action_tokens(status) WHERE status = 'active';

COMMENT ON TABLE oa_action_tokens IS 'OA审批一次性操作Token，用于钉钉通知中的快速审批链接';
COMMENT ON COLUMN oa_action_tokens.token IS '64字符crypto随机hex，一次性使用';
COMMENT ON COLUMN oa_action_tokens.action IS '操作类型：approve=同意, view=查看详情';
COMMENT ON COLUMN oa_action_tokens.status IS 'Token状态：active=可用, used=已使用, expired=已过期';
COMMENT ON COLUMN oa_action_tokens.expires_at IS 'Token过期时间，创建后30分钟';

-- 表2: 通知TaskId映射
-- 用于记录钉钉通知的task_id，以便后续更新状态栏
CREATE TABLE IF NOT EXISTS oa_notification_task_mapping (
  id SERIAL PRIMARY KEY,
  instance_id INTEGER NOT NULL REFERENCES oa_approval_instances(id) ON DELETE CASCADE,
  task_id BIGINT NOT NULL,
  receiver_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(20) NOT NULL,  -- pending / approved / rejected / transferred / countersign / withdrawn / cc
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_oa_notif_task_instance ON oa_notification_task_mapping(instance_id);
CREATE INDEX idx_oa_notif_task_task_id ON oa_notification_task_mapping(task_id);
CREATE INDEX idx_oa_notif_task_receiver ON oa_notification_task_mapping(receiver_user_id);

COMMENT ON TABLE oa_notification_task_mapping IS 'OA审批钉钉通知TaskId映射，用于状态栏更新';
COMMENT ON COLUMN oa_notification_task_mapping.task_id IS '钉钉asyncsend_v2返回的task_id';
COMMENT ON COLUMN oa_notification_task_mapping.notification_type IS '通知类型：pending=待审批, approved=已通过等';
