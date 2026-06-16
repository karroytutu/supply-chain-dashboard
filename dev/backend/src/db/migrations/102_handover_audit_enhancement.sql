-- 102_handover_audit_enhancement.sql
-- 增强流程交接审计日志：存储受影响的实例 ID 列表，便于追溯交接影响范围

ALTER TABLE oa_workflow_handovers
ADD COLUMN IF NOT EXISTS affected_instance_ids INTEGER[] DEFAULT '{}';

COMMENT ON COLUMN oa_workflow_handovers.affected_instance_ids IS '受交接影响的审批实例ID列表';
