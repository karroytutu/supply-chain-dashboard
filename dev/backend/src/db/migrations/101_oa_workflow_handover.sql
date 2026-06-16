-- 101_oa_workflow_handover.sql
-- 1. 同步代码定义中的 workflowDef 到数据库（确保 DB 为唯一权威来源）
-- 2. 创建交接审计日志表
-- 3. 新增交接权限并分配给管理员

-- =====================================================
-- Part 1: 同步 workflowDef（以代码文件为准全量覆盖）
-- =====================================================

-- 1.1 其他付款申请
UPDATE oa_form_types SET workflow_def = '{"nodes":[{"order":1,"name":"直属主管审批","type":"approval","handler":{"useSupervisor":true},"signMode":"or"},{"order":2,"name":"财务审核","type":"approval","handler":{"roleCode":"finance_staff"},"signMode":"or"},{"order":3,"name":"总经理审批","type":"approval","handler":{"roleCode":"admin"},"signMode":"or","condition":{"field":"amount","operator":">","value":50000}}],"ccRoles":["cashier"]}'::jsonb WHERE code = 'other_payment';

-- 1.2 资产采购申请
UPDATE oa_form_types SET workflow_def = '{"nodes":[{"order":1,"name":"需求提报","type":"approval","handler":{"roleCode":"admin"},"signMode":"or"},{"order":2,"name":"总经理审批","type":"approval","handler":{"roleCode":"admin"},"signMode":"or"},{"order":3,"name":"行政询价","type":"data_input","handler":{"roleCode":"admin_staff"},"signMode":"or","inputSchema":{"fields":[{"name":"lines","label":"询价结果","type":"table","required":true,"columns":[{"name":"supplierName","label":"供应商","type":"text","required":true},{"name":"quotationPrice","label":"询价单价","type":"amount","required":true},{"name":"assetTypeId","label":"资产分类","type":"erp_asset_category","required":true,"searchApi":"erp_asset_categories"},{"name":"deptId","label":"使用部门","type":"erp_department","required":false,"searchApi":"erp_departments"},{"name":"userId","label":"使用人","type":"erp_staff","required":false,"searchApi":"erp_staff","cascadeFrom":"deptId"},{"name":"depositAddress","label":"存放地点","type":"text","required":false},{"name":"estimatedResidualValueRate","label":"残值率(%)","type":"number","required":false},{"name":"depreciationMethod","label":"折旧方法","type":"select","required":false,"options":[{"label":"年限平均法","value":"YEARS_AVERAGE_METHOD"}]},{"name":"estimatedServiceMonths","label":"使用月数","type":"number","required":false}]}]}},{"order":4,"name":"总经理审批","type":"approval","handler":{"roleCode":"admin"},"signMode":"or"},{"order":5,"name":"出纳支付","type":"data_input","handler":{"roleCode":"cashier"},"signMode":"or","inputSchema":{"fields":[{"name":"paymentAmount","label":"支付金额","type":"amount","required":true},{"name":"paymentDate","label":"支付日期","type":"date","required":true},{"name":"paymentSubjectId","label":"付款账户","type":"erp_payment_account","required":true,"searchApi":"erp_payment_accounts"},{"name":"receiptUrls","label":"支付回单","type":"upload","required":false},{"name":"paymentNote","label":"支付备注","type":"text","required":false}]}},{"order":6,"name":"行政采购","type":"data_input","handler":{"roleCode":"admin_staff"},"signMode":"or","inputSchema":{"fields":[{"name":"purchaseDate","label":"采购日期","type":"date","required":true},{"name":"purchaseNote","label":"采购备注","type":"text","required":false}]}},{"order":7,"name":"资产入库","type":"data_input","handler":{"roleCode":"admin_staff"},"signMode":"or","inputSchema":{"fields":[{"name":"lines","label":"入库信息","type":"table","required":true,"columns":[{"name":"actualPrice","label":"实际单价","type":"amount","required":true},{"name":"arrivalDate","label":"到货日期","type":"date","required":true},{"name":"note","label":"备注","type":"text","required":false}]}]}}],"ccRoles":["current_accountant"]}'::jsonb WHERE code = 'asset_purchase';

-- 1.3 资产调拨
UPDATE oa_form_types SET workflow_def = '{"nodes":[{"order":1,"name":"行政专员审批","type":"approval","handler":{"roleCode":"admin_staff"},"signMode":"or"}],"ccRoles":["admin"]}'::jsonb WHERE code = 'asset_transfer';

-- 1.4 资产维修
UPDATE oa_form_types SET workflow_def = '{"nodes":[{"order":1,"name":"需求提报","type":"approval","handler":{"roleCode":"admin"},"signMode":"or"},{"order":2,"name":"行政询价","type":"data_input","handler":{"roleCode":"admin_staff"},"signMode":"or","condition":{"field":"estimatedCost","operator":">=","value":500},"inputSchema":{"fields":[{"name":"quotations","label":"询价结果","type":"table","required":true,"columns":[{"name":"supplierName","label":"供应商","type":"text","required":true},{"name":"quotationPrice","label":"报价","type":"amount","required":true},{"name":"quotationNote","label":"备注","type":"text","required":false}]}]}},{"order":3,"name":"总经理审批","type":"approval","handler":{"roleCode":"admin"},"signMode":"or"},{"order":4,"name":"财务支付","type":"data_input","handler":{"roleCode":"cashier"},"signMode":"or","inputSchema":{"fields":[{"name":"paymentAmount","label":"支付金额","type":"amount","required":true},{"name":"paymentDate","label":"支付日期","type":"date","required":true},{"name":"paymentSubjectId","label":"付款账户","type":"erp_payment_account","required":true,"searchApi":"erp_payment_accounts"},{"name":"receiptUrls","label":"支付回单","type":"upload","required":false},{"name":"paymentNote","label":"支付备注","type":"text","required":false}]}}],"ccRoles":["current_accountant"]}'::jsonb WHERE code = 'asset_maintenance';

-- 1.5 资产处置
UPDATE oa_form_types SET workflow_def = '{"nodes":[{"order":1,"name":"总经理审批","type":"approval","handler":{"roleCode":"admin"},"signMode":"or"}]}'::jsonb WHERE code = 'asset_disposal';

-- 1.6 客户授信申请
UPDATE oa_form_types SET workflow_def = '{"nodes":[{"order":1,"name":"营销经理审批","type":"approval","handler":{"roleCode":"marketing_manager"},"interactionType":"approval","signMode":"or"},{"order":2,"name":"往来会计审批","type":"approval","handler":{"roleCode":"current_accountant"},"interactionType":"approval","signMode":"or"},{"order":3,"name":"更新ERP客户授信","type":"auto"}]}'::jsonb WHERE code = 'customer_credit';

-- 1.7 考核申诉
UPDATE oa_form_types SET workflow_def = '{"nodes":[{"order":1,"name":"总经理审批","type":"approval","handler":{"roleCode":"general_manager"},"signMode":"or"}]}'::jsonb WHERE code = 'assessment_appeal';

-- 1.8 客户档案变更
UPDATE oa_form_types SET workflow_def = '{"nodes":[{"order":1,"name":"营销经理审批","type":"approval","handler":{"roleCode":"marketing_manager"},"interactionType":"approval","signMode":"or"},{"order":2,"name":"更新ERP客户档案","type":"auto"}]}'::jsonb WHERE code = 'customer_modify';

-- 1.9 催收管理
UPDATE oa_form_types SET workflow_def = '{"nodes":[{"order":1,"name":"营销师催收","type":"approval","handler":{"roleCode":"marketer"},"signMode":"or","interactionType":"operation","fieldPermissions":{"consumerName":"readonly","totalAmount":"readonly","billCount":"readonly","maxOverdueDays":"readonly","managerName":"readonly","maxDebtDays":"readonly","maxDebtOrderNum":"readonly","billDetails":"readonly","action":"editable","verifyRemark":"editable","extensionDays":"editable","extensionReason":"editable","guarantorSignature":"editable","differenceRemark":"editable","escalateReason":"editable","resolveDiffRemark":"editable","letterAttachment":"editable","deliveryProof":"editable"},"fieldOptionFilter":{"action":["verify","extension","difference","escalate"]},"timeout":{"durationMinutes":4320,"reminder":{"firstReminderDelayMinutes":0,"intervalMinutes":480,"maxReminders":10,"ccSupervisorAfterCount":2},"assessment":{"exemptNodeNames":["起诉立案","庭审进展","判决结果","执行进展","更新催收状态"],"tiers":[{"name":"一级考核(3-5天)","minOverdueDays":3,"maxOverdueDays":5,"penaltyAmount":10},{"name":"二级考核(5-7天)","minOverdueDays":5,"maxOverdueDays":7,"penaltyAmount":20},{"name":"三级考核(7天+)","minOverdueDays":7,"maxOverdueDays":null,"penaltyAmount":50}]}}},{"order":2,"name":"更新催收状态","type":"auto"}]}'::jsonb WHERE code = 'ar_collection';

-- =====================================================
-- Part 2: 交接审计日志表
-- =====================================================

CREATE TABLE IF NOT EXISTS oa_workflow_handovers (
    id SERIAL PRIMARY KEY,
    source_user_id INTEGER NOT NULL REFERENCES users(id),
    source_user_name VARCHAR(100) NOT NULL,
    target_user_id INTEGER NOT NULL REFERENCES users(id),
    target_user_name VARCHAR(100) NOT NULL,
    operator_id INTEGER NOT NULL REFERENCES users(id),
    operator_name VARCHAR(100) NOT NULL,
    form_types_updated INTEGER DEFAULT 0,
    instances_updated INTEGER DEFAULT 0,
    nodes_reassigned INTEGER DEFAULT 0,
    affected_form_type_codes TEXT[],
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oa_handovers_created ON oa_workflow_handovers(created_at DESC);

COMMENT ON TABLE oa_workflow_handovers IS 'OA流程交接审计日志';

-- =====================================================
-- Part 3: 权限配置
-- =====================================================

INSERT INTO permissions (code, name, resource_type, resource_key, action)
VALUES ('oa:workflow:handover', '流程交接', 'api', '/api/oa/workflow-handover', 'write')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'admin' AND p.code = 'oa:workflow:handover'
ON CONFLICT DO NOTHING;
