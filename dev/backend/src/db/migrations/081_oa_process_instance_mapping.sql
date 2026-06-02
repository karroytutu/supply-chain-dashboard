-- OA审批钉钉流程中心壳实例映射
-- 每次提交审批时在钉钉创建一个壳实例（fakeMode），获取 processInstanceId

CREATE TABLE IF NOT EXISTS oa_process_instance_mapping (
  id SERIAL PRIMARY KEY,
  instance_id INTEGER NOT NULL REFERENCES oa_approval_instances(id) ON DELETE CASCADE,
  dingtalk_process_instance_id VARCHAR(128),           -- 钉钉壳实例ID（/topapi/process/workrecord/create 返回）
  dingtalk_process_code VARCHAR(128) NOT NULL,         -- 使用的模板 processCode（冗余，便于排查）
  status VARCHAR(20) NOT NULL DEFAULT 'active',        -- active=正常 / failed=壳实例创建失败 / completed=已完结 / terminated=已撤回或拒绝
  originator_user_id VARCHAR(64),                      -- 发起人的 dingtalk_user_id
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_oa_pim_instance ON oa_process_instance_mapping(instance_id);
CREATE INDEX idx_oa_pim_dt_instance ON oa_process_instance_mapping(dingtalk_process_instance_id)
  WHERE dingtalk_process_instance_id IS NOT NULL;

COMMENT ON TABLE oa_process_instance_mapping IS 'OA审批实例与钉钉流程中心壳实例的映射';
COMMENT ON COLUMN oa_process_instance_mapping.dingtalk_process_instance_id IS '钉钉壳实例ID（/topapi/process/workrecord/create 返回）';
COMMENT ON COLUMN oa_process_instance_mapping.status IS 'active=正常 / failed=壳实例创建失败 / completed=审批完结 / terminated=已撤回或拒绝';
