-- OA审批钉钉流程中心待办任务映射
-- 替换旧版 oa_todo_task_mapping（Todo v1.0 未使用，直接删除）

DROP TABLE IF EXISTS oa_todo_task_mapping;

CREATE TABLE oa_process_task_mapping (
  id SERIAL PRIMARY KEY,
  instance_id INTEGER NOT NULL REFERENCES oa_approval_instances(id) ON DELETE CASCADE,
  pc_task_id BIGINT NOT NULL,                         -- 流程中心任务ID（数字类型，区别于旧版 UUID 字符串）
  activity_id VARCHAR(128) NOT NULL,                   -- 待办组ID，格式：{instanceId}:node{nodeOrder}，用于批量取消
  executor_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  executor_dingtalk_user_id VARCHAR(64) NOT NULL,      -- 审批人的 dingtalk_user_id（流程中心 API 使用此标识）
  status VARCHAR(20) NOT NULL DEFAULT 'pending',       -- pending=待处理 / completed=已完成 / canceled=已取消 / failed=创建失败
  result VARCHAR(20),                                  -- AGREE=同意 / REFUSE=拒绝（完成时记录）
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE INDEX idx_pc_task_instance ON oa_process_task_mapping(instance_id);
CREATE INDEX idx_pc_task_task ON oa_process_task_mapping(pc_task_id);
CREATE INDEX idx_pc_task_pending ON oa_process_task_mapping(instance_id, status) WHERE status = 'pending';
CREATE INDEX idx_pc_task_activity ON oa_process_task_mapping(instance_id, activity_id);

COMMENT ON TABLE oa_process_task_mapping IS 'OA审批流程中心待办任务映射，追踪待办的创建与完成状态';
COMMENT ON COLUMN oa_process_task_mapping.pc_task_id IS '流程中心任务ID（BIGINT，/v1.0/workflow/processCentres/tasks 返回）';
COMMENT ON COLUMN oa_process_task_mapping.activity_id IS '待办组ID，格式：{instanceId}:node{nodeOrder}，同一节点含加签人共享同一 activityId';
COMMENT ON COLUMN oa_process_task_mapping.executor_dingtalk_user_id IS '审批人的钉钉企业内userId（流程中心API要求）';
COMMENT ON COLUMN oa_process_task_mapping.status IS '状态：pending=待处理, completed=已完成, canceled=已取消, failed=创建失败';
COMMENT ON COLUMN oa_process_task_mapping.result IS '审批结果：AGREE=同意, REFUSE=拒绝（仅 status=completed 时有值）';
