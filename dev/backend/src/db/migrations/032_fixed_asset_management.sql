-- 固定资产管理模块数据库迁移
-- 1. erp_api_logs 表 - ERP API 调用日志
-- 2. asset_applications 表 - 固定资产申请记录
-- 3. oa_approval_nodes 扩展 - 新增 input_schema/input_data 字段
-- 4. 序列与函数 - 申请编号生成
-- 5. 权限种子数据 + 角色分配
-- 6. 新增 admin_staff 角色

-- =====================================================
-- 1. erp_api_logs 表
-- =====================================================
CREATE TABLE IF NOT EXISTS erp_api_logs (
    id SERIAL PRIMARY KEY,
    request_id VARCHAR(36) NOT NULL,
    method VARCHAR(10) NOT NULL,
    path VARCHAR(500) NOT NULL,
    request_headers JSONB,
    request_body JSONB,
    response_status INTEGER,
    response_body JSONB,
    error_message TEXT,
    duration_ms INTEGER,
    retry_count INTEGER DEFAULT 0,
    business_type VARCHAR(50),
    business_id INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE erp_api_logs IS '舟谱ERP API调用日志';
COMMENT ON COLUMN erp_api_logs.request_id IS '请求唯一ID (UUID)';
COMMENT ON COLUMN erp_api_logs.method IS 'HTTP方法';
COMMENT ON COLUMN erp_api_logs.path IS 'API路径';
COMMENT ON COLUMN erp_api_logs.request_headers IS '请求头(脱敏)';
COMMENT ON COLUMN erp_api_logs.request_body IS '请求体';
COMMENT ON COLUMN erp_api_logs.response_status IS 'HTTP状态码';
COMMENT ON COLUMN erp_api_logs.response_body IS '响应体';
COMMENT ON COLUMN erp_api_logs.error_message IS '错误信息';
COMMENT ON COLUMN erp_api_logs.duration_ms IS '耗时(ms)';
COMMENT ON COLUMN erp_api_logs.retry_count IS '重试次数';
COMMENT ON COLUMN erp_api_logs.business_type IS '业务类型(fixed_asset_purchase等)';
COMMENT ON COLUMN erp_api_logs.business_id IS '关联业务记录ID';

CREATE INDEX idx_erp_api_logs_business ON erp_api_logs(business_type, business_id);
CREATE INDEX idx_erp_api_logs_created_at ON erp_api_logs(created_at DESC);
CREATE INDEX idx_erp_api_logs_path ON erp_api_logs(path);

-- =====================================================
-- 2. asset_applications 表
-- =====================================================
CREATE TABLE IF NOT EXISTS asset_applications (
    id SERIAL PRIMARY KEY,
    application_no VARCHAR(64) UNIQUE NOT NULL,
    type VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    form_data JSONB NOT NULL,
    oa_instance_id INTEGER REFERENCES oa_approval_instances(id) ON DELETE SET NULL,
    erp_request_log JSONB,
    erp_response_data JSONB,
    applicant_id INTEGER NOT NULL REFERENCES users(id),
    applicant_name VARCHAR(100),
    department_id INTEGER REFERENCES dingtalk_departments(id),
    remark TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE asset_applications IS '固定资产申请记录';
COMMENT ON COLUMN asset_applications.application_no IS '申请编号，格式：APA+YYYYMMDD+序号';
COMMENT ON COLUMN asset_applications.type IS '申请类型：purchase/transfer/maintenance/disposal';
COMMENT ON COLUMN asset_applications.status IS '状态：pending/quoting/paying/purchasing/storing/approved/rejected/cancelled/completed/erp_failed';
COMMENT ON COLUMN asset_applications.form_data IS '表单数据 JSON（各类型不同）';
COMMENT ON COLUMN asset_applications.oa_instance_id IS '关联OA审批实例ID';
COMMENT ON COLUMN asset_applications.erp_request_log IS 'ERP调用请求日志';
COMMENT ON COLUMN asset_applications.erp_response_data IS 'ERP返回数据（如创建的资产ID）';
COMMENT ON COLUMN asset_applications.applicant_id IS '申请人ID';
COMMENT ON COLUMN asset_applications.applicant_name IS '申请人姓名';
COMMENT ON COLUMN asset_applications.department_id IS '申请部门ID';

CREATE INDEX idx_asset_applications_type ON asset_applications(type);
CREATE INDEX idx_asset_applications_status ON asset_applications(status);
CREATE INDEX idx_asset_applications_applicant ON asset_applications(applicant_id);
CREATE INDEX idx_asset_applications_oa_instance ON asset_applications(oa_instance_id);

-- 自动更新 updated_at 触发器
DROP TRIGGER IF EXISTS trigger_asset_applications_updated ON asset_applications;
CREATE TRIGGER trigger_asset_applications_updated
    BEFORE UPDATE ON asset_applications
    FOR EACH ROW EXECUTE FUNCTION update_oa_updated_at();

-- =====================================================
-- 3. oa_approval_nodes 扩展 - 支持 data_input 节点
-- =====================================================
ALTER TABLE oa_approval_nodes ADD COLUMN IF NOT EXISTS input_schema JSONB;
ALTER TABLE oa_approval_nodes ADD COLUMN IF NOT EXISTS input_data JSONB;

COMMENT ON COLUMN oa_approval_nodes.input_schema IS '数据录入节点表单schema (仅data_input类型)';
COMMENT ON COLUMN oa_approval_nodes.input_data IS '数据录入节点录入的数据';

-- 更新 node_type 注释，增加 data_input
COMMENT ON COLUMN oa_approval_nodes.node_type IS '节点类型：role/dynamic_supervisor/specific_user/countersign/data_input';

-- =====================================================
-- 4. 序列与函数 - 申请编号生成
-- =====================================================
CREATE SEQUENCE IF NOT EXISTS asset_application_no_seq START 1;

CREATE OR REPLACE FUNCTION generate_asset_application_no()
RETURNS VARCHAR AS $$
DECLARE
    seq_num INTEGER;
    date_prefix VARCHAR(8);
    result VARCHAR(64);
BEGIN
    date_prefix := TO_CHAR(NOW(), 'YYYYMMDD');
    seq_num := nextval('asset_application_no_seq');
    result := 'APA' || date_prefix || LPAD(seq_num::TEXT, 4, '0');
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. 新增 admin_staff 角色
-- =====================================================
INSERT INTO roles (code, name, description, is_system) VALUES
    ('admin_staff', '行政专员', '负责采购询价、采购执行、资产入库等行政操作', TRUE)
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- 6. 权限定义与角色分配
-- =====================================================
INSERT INTO permissions (code, name, resource_type, resource_key, action) VALUES
    ('asset:read', '查看资产申请', 'menu', '/asset', 'read'),
    ('asset:write', '提交资产申请', 'api', '/api/fixed-assets', 'write'),
    ('asset:data_input', '资产流程数据录入', 'api', '/api/fixed-assets/data-input', 'write')
ON CONFLICT (code) DO NOTHING;

-- admin: 全部权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'admin'
AND p.code IN ('asset:read', 'asset:write', 'asset:data_input')
ON CONFLICT DO NOTHING;

-- viewer: 只读
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'viewer'
AND p.code IN ('asset:read')
ON CONFLICT DO NOTHING;

-- operations_manager: 读写
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'operations_manager'
AND p.code IN ('asset:read', 'asset:write')
ON CONFLICT DO NOTHING;

-- current_accountant: 只读（抄送观察）
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'current_accountant'
AND p.code IN ('asset:read')
ON CONFLICT DO NOTHING;

-- admin_staff: 只读+数据录入
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'admin_staff'
AND p.code IN ('asset:read', 'asset:data_input')
ON CONFLICT DO NOTHING;

-- cashier: 只读+数据录入（出纳支付节点）
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'cashier'
AND p.code IN ('asset:read', 'asset:data_input')
ON CONFLICT DO NOTHING;

-- warehouse_keeper / warehouse_manager: 读写
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('warehouse_keeper', 'warehouse_manager')
AND p.code IN ('asset:read', 'asset:write')
ON CONFLICT DO NOTHING;
