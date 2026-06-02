-- OA审批钉钉流程中心模板映射
-- 系统表单类型 → 钉钉流程中心审批模板 processCode（fakeMode 壳模板）

CREATE TABLE IF NOT EXISTS oa_process_template_mapping (
  id SERIAL PRIMARY KEY,
  form_type_code VARCHAR(64) NOT NULL UNIQUE,        -- 系统表单类型编码（对应 oa_form_types.code）
  dingtalk_process_code VARCHAR(128) NOT NULL,        -- 钉钉模板 processCode（/topapi/process/save 返回）
  template_name VARCHAR(256) NOT NULL,                -- 钉钉模板名称（便于运维核对）
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_oa_ptm_code ON oa_process_template_mapping(form_type_code);

COMMENT ON TABLE oa_process_template_mapping IS 'OA表单类型与钉钉流程中心壳模板processCode的映射';
COMMENT ON COLUMN oa_process_template_mapping.form_type_code IS '系统表单类型编码（对应 oa_form_types.code）';
COMMENT ON COLUMN oa_process_template_mapping.dingtalk_process_code IS '钉钉流程中心模板编码（/topapi/process/save 返回）';
