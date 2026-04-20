-- 035: OA审批实例添加 erp_meta 列
-- 用于固定资产审批流程中跟踪ERP处理状态、响应数据和APA编号
-- 独立于 form_data（用户输入）和 status（审批流程状态）

ALTER TABLE oa_approval_instances ADD COLUMN IF NOT EXISTS erp_meta JSONB DEFAULT NULL;

COMMENT ON COLUMN oa_approval_instances.erp_meta IS 'ERP处理元数据，包含status/responseData/requestLog/applicationNo/retries';
