-- OA审批模块数据库迁移
-- 创建表单类型、审批实例、审批节点、抄送记录、操作日志、站内消息等表

-- =====================================================
-- 1. oa_form_types 表单类型定义表
-- =====================================================
CREATE TABLE IF NOT EXISTS oa_form_types (
    id SERIAL PRIMARY KEY,
    code VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    icon VARCHAR(50),
    category VARCHAR(50) NOT NULL,
    sort_order INTEGER DEFAULT 0,
    description TEXT,
    form_schema JSONB NOT NULL,
    workflow_def JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE oa_form_types IS 'OA审批表单类型定义';
COMMENT ON COLUMN oa_form_types.code IS '类型编码，唯一标识';
COMMENT ON COLUMN oa_form_types.name IS '显示名称';
COMMENT ON COLUMN oa_form_types.icon IS '图标名称';
COMMENT ON COLUMN oa_form_types.category IS '分类：finance/supply_chain/marketing/hr/admin';
COMMENT ON COLUMN oa_form_types.sort_order IS '同分类内排序';
COMMENT ON COLUMN oa_form_types.description IS '描述说明';
COMMENT ON COLUMN oa_form_types.form_schema IS '表单字段定义 JSON';
COMMENT ON COLUMN oa_form_types.workflow_def IS '审批流程定义 JSON';
COMMENT ON COLUMN oa_form_types.is_active IS '是否启用';
COMMENT ON COLUMN oa_form_types.version IS '版本号';

CREATE INDEX idx_oa_form_types_category ON oa_form_types(category);
CREATE INDEX idx_oa_form_types_active ON oa_form_types(is_active);

-- =====================================================
-- 2. oa_approval_instances 审批实例表
-- =====================================================
CREATE TABLE IF NOT EXISTS oa_approval_instances (
    id SERIAL PRIMARY KEY,
    instance_no VARCHAR(64) UNIQUE NOT NULL,
    form_type_id INTEGER NOT NULL REFERENCES oa_form_types(id),
    title VARCHAR(500) NOT NULL,
    form_data JSONB NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    urgency VARCHAR(20) DEFAULT 'normal',
    applicant_id INTEGER NOT NULL REFERENCES users(id),
    applicant_name VARCHAR(100) NOT NULL,
    applicant_dept VARCHAR(100),
    current_node_order INTEGER DEFAULT 1,
    submitted_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE oa_approval_instances IS 'OA审批实例';
COMMENT ON COLUMN oa_approval_instances.instance_no IS '审批编号，格式：OA+YYYYMMDD+序号';
COMMENT ON COLUMN oa_approval_instances.form_type_id IS '表单类型ID';
COMMENT ON COLUMN oa_approval_instances.title IS '摘要标题';
COMMENT ON COLUMN oa_approval_instances.form_data IS '提交的表单数据 JSON';
COMMENT ON COLUMN oa_approval_instances.status IS '状态：pending/approved/rejected/cancelled/withdrawn';
COMMENT ON COLUMN oa_approval_instances.urgency IS '紧急程度：normal/high/urgent';
COMMENT ON COLUMN oa_approval_instances.applicant_id IS '申请人ID';
COMMENT ON COLUMN oa_approval_instances.applicant_name IS '申请人姓名（冗余）';
COMMENT ON COLUMN oa_approval_instances.applicant_dept IS '申请人部门';
COMMENT ON COLUMN oa_approval_instances.current_node_order IS '当前审批节点序号';
COMMENT ON COLUMN oa_approval_instances.submitted_at IS '提交时间';
COMMENT ON COLUMN oa_approval_instances.completed_at IS '完成时间';

CREATE INDEX idx_oa_instances_status ON oa_approval_instances(status);
CREATE INDEX idx_oa_instances_applicant ON oa_approval_instances(applicant_id);
CREATE INDEX idx_oa_instances_form_type ON oa_approval_instances(form_type_id);
CREATE INDEX idx_oa_instances_submitted ON oa_approval_instances(submitted_at DESC);

-- =====================================================
-- 3. oa_approval_nodes 审批节点表
-- =====================================================
CREATE TABLE IF NOT EXISTS oa_approval_nodes (
    id SERIAL PRIMARY KEY,
    instance_id INTEGER NOT NULL REFERENCES oa_approval_instances(id) ON DELETE CASCADE,
    node_order INTEGER NOT NULL,
    node_name VARCHAR(100) NOT NULL,
    node_type VARCHAR(30) NOT NULL,
    role_code VARCHAR(50),
    assigned_user_id INTEGER REFERENCES users(id),
    assigned_user_name VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    comment TEXT,
    acted_at TIMESTAMP,
    is_countersign BOOLEAN DEFAULT FALSE,
    countersign_parent_node_id INTEGER REFERENCES oa_approval_nodes(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(instance_id, node_order)
);

COMMENT ON TABLE oa_approval_nodes IS 'OA审批节点记录';
COMMENT ON COLUMN oa_approval_nodes.instance_id IS '审批实例ID';
COMMENT ON COLUMN oa_approval_nodes.node_order IS '节点序号';
COMMENT ON COLUMN oa_approval_nodes.node_name IS '节点显示名称';
COMMENT ON COLUMN oa_approval_nodes.node_type IS '节点类型：role/dynamic_supervisor/specific_user/countersign';
COMMENT ON COLUMN oa_approval_nodes.role_code IS '角色编码（node_type=role时）';
COMMENT ON COLUMN oa_approval_nodes.assigned_user_id IS '实际审批人ID';
COMMENT ON COLUMN oa_approval_nodes.assigned_user_name IS '实际审批人姓名';
COMMENT ON COLUMN oa_approval_nodes.status IS '状态：pending/approved/rejected/transferred/skipped/cancelled';
COMMENT ON COLUMN oa_approval_nodes.comment IS '审批意见';
COMMENT ON COLUMN oa_approval_nodes.acted_at IS '操作时间';
COMMENT ON COLUMN oa_approval_nodes.is_countersign IS '是否为加签节点';
COMMENT ON COLUMN oa_approval_nodes.countersign_parent_node_id IS '加签来源节点ID';

CREATE INDEX idx_oa_nodes_instance ON oa_approval_nodes(instance_id);
CREATE INDEX idx_oa_nodes_assigned ON oa_approval_nodes(assigned_user_id, status);

-- =====================================================
-- 4. oa_approval_cc 抄送记录表
-- =====================================================
CREATE TABLE IF NOT EXISTS oa_approval_cc (
    id SERIAL PRIMARY KEY,
    instance_id INTEGER NOT NULL REFERENCES oa_approval_instances(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    user_name VARCHAR(100),
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(instance_id, user_id)
);

COMMENT ON TABLE oa_approval_cc IS 'OA审批抄送记录';
COMMENT ON COLUMN oa_approval_cc.instance_id IS '审批实例ID';
COMMENT ON COLUMN oa_approval_cc.user_id IS '抄送用户ID';
COMMENT ON COLUMN oa_approval_cc.user_name IS '抄送用户姓名';
COMMENT ON COLUMN oa_approval_cc.read_at IS '阅读时间';

CREATE INDEX idx_oa_cc_user ON oa_approval_cc(user_id);

-- =====================================================
-- 5. oa_approval_actions 操作审计日志表
-- =====================================================
CREATE TABLE IF NOT EXISTS oa_approval_actions (
    id SERIAL PRIMARY KEY,
    instance_id INTEGER NOT NULL REFERENCES oa_approval_instances(id) ON DELETE CASCADE,
    action_type VARCHAR(30) NOT NULL,
    operator_id INTEGER REFERENCES users(id),
    operator_name VARCHAR(100),
    node_order INTEGER,
    comment TEXT,
    details JSONB,
    action_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE oa_approval_actions IS 'OA审批操作审计日志';
COMMENT ON COLUMN oa_approval_actions.instance_id IS '审批实例ID';
COMMENT ON COLUMN oa_approval_actions.action_type IS '操作类型：submit/approve/reject/transfer/countersign/withdraw/cancel/resubmit';
COMMENT ON COLUMN oa_approval_actions.operator_id IS '操作人ID';
COMMENT ON COLUMN oa_approval_actions.operator_name IS '操作人姓名';
COMMENT ON COLUMN oa_approval_actions.node_order IS '操作节点序号';
COMMENT ON COLUMN oa_approval_actions.comment IS '操作意见';
COMMENT ON COLUMN oa_approval_actions.details IS '操作详情 JSON（如转交目标、加签用户列表）';

CREATE INDEX idx_oa_actions_instance ON oa_approval_actions(instance_id);
CREATE INDEX idx_oa_actions_operator ON oa_approval_actions(operator_id);
CREATE INDEX idx_oa_actions_time ON oa_approval_actions(action_at DESC);

-- =====================================================
-- 6. oa_in_app_messages 站内消息表
-- =====================================================
CREATE TABLE IF NOT EXISTS oa_in_app_messages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type VARCHAR(30) NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT,
    instance_id INTEGER REFERENCES oa_approval_instances(id) ON DELETE SET NULL,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE oa_in_app_messages IS 'OA站内消息';
COMMENT ON COLUMN oa_in_app_messages.user_id IS '接收用户ID';
COMMENT ON COLUMN oa_in_app_messages.type IS '消息类型：approval_pending/cc/result';
COMMENT ON COLUMN oa_in_app_messages.title IS '消息标题';
COMMENT ON COLUMN oa_in_app_messages.content IS '消息内容';
COMMENT ON COLUMN oa_in_app_messages.instance_id IS '关联审批实例ID';
COMMENT ON COLUMN oa_in_app_messages.is_read IS '是否已读';

CREATE INDEX idx_oa_messages_user ON oa_in_app_messages(user_id, is_read);
CREATE INDEX idx_oa_messages_time ON oa_in_app_messages(created_at DESC);

-- =====================================================
-- 7. 触发器：自动更新 updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_oa_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_oa_form_types_updated
    BEFORE UPDATE ON oa_form_types
    FOR EACH ROW EXECUTE FUNCTION update_oa_updated_at();

CREATE TRIGGER trigger_oa_instances_updated
    BEFORE UPDATE ON oa_approval_instances
    FOR EACH ROW EXECUTE FUNCTION update_oa_updated_at();

CREATE TRIGGER trigger_oa_nodes_updated
    BEFORE UPDATE ON oa_approval_nodes
    FOR EACH ROW EXECUTE FUNCTION update_oa_updated_at();

-- =====================================================
-- 8. 权限定义
-- =====================================================
INSERT INTO permissions (code, name, resource_type, resource_key, action) VALUES
    ('oa:approval:read', '查看OA审批', 'menu', '/oa', 'read'),
    ('oa:approval:write', '操作OA审批', 'api', '/api/oa-approval', 'write'),
    ('oa:data:read', '查看审批数据管理', 'menu', '/oa/data', 'read'),
    ('oa:data:export', '导出审批数据', 'api', '/api/oa-approval/data/export', 'export')
ON CONFLICT (code) DO NOTHING;

-- 为管理员和经理分配权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code IN ('admin', 'manager') 
AND p.code IN ('oa:approval:read', 'oa:approval:write', 'oa:data:read', 'oa:data:export')
ON CONFLICT DO NOTHING;

-- 为普通用户分配基本权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'viewer'
AND p.code IN ('oa:approval:read')
ON CONFLICT DO NOTHING;

-- =====================================================
-- 9. 种子数据：其他付款申请单
-- =====================================================
INSERT INTO oa_form_types (code, name, icon, category, sort_order, description, form_schema, workflow_def, is_active, version)
VALUES (
    'other_payment',
    '其他付款申请单',
    'PayCircleOutlined',
    'finance',
    100,
    '用于其他付款事项的审批申请',
    '{
        "fields": [
            {
                "key": "payeeName",
                "label": "收款方",
                "type": "text",
                "required": true,
                "placeholder": "请输入收款方名称"
            },
            {
                "key": "amount",
                "label": "付款金额",
                "type": "money",
                "required": true,
                "placeholder": "请输入金额",
                "upper": true
            },
            {
                "key": "paymentReason",
                "label": "付款事由",
                "type": "textarea",
                "required": true,
                "maxLength": 500
            },
            {
                "key": "attachmentUrls",
                "label": "附件",
                "type": "upload",
                "required": false,
                "maxCount": 5
            },
            {
                "key": "remark",
                "label": "备注",
                "type": "textarea",
                "required": false,
                "maxLength": 200
            }
        ]
    }'::jsonb,
    '{
        "nodes": [
            {
                "order": 1,
                "name": "直属主管",
                "type": "dynamic_supervisor"
            },
            {
                "order": 2,
                "name": "财务审核",
                "type": "role",
                "roleCode": "finance_staff"
            },
            {
                "order": 3,
                "name": "总经理",
                "type": "role",
                "roleCode": "admin",
                "condition": {
                    "field": "amount",
                    "operator": ">",
                    "value": 50000
                }
            }
        ],
        "ccRoles": ["cashier"]
    }'::jsonb,
    true,
    1
);

-- =====================================================
-- 10. 创建实例编号序列
-- =====================================================
CREATE SEQUENCE IF NOT EXISTS oa_instance_no_seq START 1;

-- 函数：生成审批实例编号
CREATE OR REPLACE FUNCTION generate_oa_instance_no()
RETURNS VARCHAR AS $$
DECLARE
    seq_num INTEGER;
    date_prefix VARCHAR(8);
    result VARCHAR(64);
BEGIN
    date_prefix := TO_CHAR(NOW(), 'YYYYMMDD');
    seq_num := nextval('oa_instance_no_seq');
    result := 'OA' || date_prefix || LPAD(seq_num::TEXT, 4, '0');
    RETURN result;
END;
$$ LANGUAGE plpgsql;
