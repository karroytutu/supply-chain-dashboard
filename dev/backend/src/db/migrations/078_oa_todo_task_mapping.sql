-- OA审批钉钉待办Todo任务映射
-- 独立建表原因：oa_notification_task_mapping.task_id 是 BIGINT（工作通知 ID），
-- 钉钉待办 ID 是字符串（UUID），类型不兼容，且两套 ID 来自不同 API 体系

CREATE TABLE IF NOT EXISTS oa_todo_task_mapping (
  id SERIAL PRIMARY KEY,
  instance_id INTEGER NOT NULL REFERENCES oa_approval_instances(id) ON DELETE CASCADE,
  todo_task_id VARCHAR(128) NOT NULL,          -- 钉钉Todo API返回的UUID字符串
  creator_union_id VARCHAR(64) NOT NULL,       -- 创建者unionId（URL路径参数，完成待办时需要）
  executor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending=待处理 / completed=已完成 / failed=创建失败
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_oa_todo_instance ON oa_todo_task_mapping(instance_id);
CREATE INDEX idx_oa_todo_task_id ON oa_todo_task_mapping(todo_task_id);
CREATE INDEX idx_oa_todo_pending ON oa_todo_task_mapping(instance_id, status) WHERE status = 'pending';

COMMENT ON TABLE oa_todo_task_mapping IS 'OA审批钉钉待办Todo任务映射，用于追踪待办的创建与完成状态';
COMMENT ON COLUMN oa_todo_task_mapping.todo_task_id IS '钉钉Todo API返回的任务ID（UUID字符串，如 task1034dd4c...）';
COMMENT ON COLUMN oa_todo_task_mapping.creator_union_id IS '创建者的unionId，即审批人自己的unionId（Todo API URL路径参数）';
COMMENT ON COLUMN oa_todo_task_mapping.executor_user_id IS '执行人（审批人）的系统用户ID';
COMMENT ON COLUMN oa_todo_task_mapping.status IS '状态：pending=待处理, completed=已完成, failed=创建失败';
