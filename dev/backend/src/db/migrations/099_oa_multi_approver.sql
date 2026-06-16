-- 099: OA 审批环节多人协同支持
-- 1. 解除同一环节只能一条记录的限制
-- 2. 新增签署模式字段
-- 3. 迁移已有数据中的旧环节类型值

-- ============================================
-- A. 结构变更
-- ============================================

-- 1. 删除 UNIQUE(instance_id, node_order) 约束（阻塞同 order 多记录）
ALTER TABLE oa_approval_nodes DROP CONSTRAINT IF EXISTS oa_approval_nodes_instance_id_node_order_key;

-- 2. 替换为普通索引（保持查询性能）
CREATE INDEX IF NOT EXISTS idx_oa_nodes_instance_order ON oa_approval_nodes(instance_id, node_order);

-- 3. 新增 sign_mode 列（签署模式）
ALTER TABLE oa_approval_nodes ADD COLUMN sign_mode VARCHAR(3) DEFAULT NULL;

COMMENT ON COLUMN oa_approval_nodes.sign_mode IS '签署模式：or=或签（任一人通过即可），and=会签（所有人通过才算），NULL=单人环节';

-- 4. 优化同组查询索引
CREATE INDEX idx_oa_nodes_sign_query ON oa_approval_nodes(instance_id, node_order, sign_mode)
  WHERE sign_mode IS NOT NULL;

-- ============================================
-- B. 已有实例数据迁移
-- ============================================

-- 5. 迁移旧 node_type 值为新值
-- role / dynamic_supervisor / specific_user → approval
UPDATE oa_approval_nodes SET node_type = 'approval'
  WHERE node_type IN ('role', 'dynamic_supervisor', 'specific_user');

-- 6. 迁移 oa_form_types 种子数据中的 workflow_def
-- 其他付款申请单
UPDATE oa_form_types
SET workflow_def = '{"nodes":[{"order":1,"name":"直属主管审批","type":"approval","handler":{"useSupervisor":true},"signMode":"or"},{"order":2,"name":"财务审核","type":"approval","handler":{"roleCode":"finance_staff"},"signMode":"or"},{"order":3,"name":"总经理审批","type":"approval","handler":{"roleCode":"admin"},"condition":{"field":"amount","operator":">","value":50000},"signMode":"or"}],"ccRoles":["cashier"]}'::jsonb
WHERE code = 'other_payment';

-- 客户授信
UPDATE oa_form_types
SET workflow_def = '{"nodes":[{"order":1,"name":"营销经理审批","type":"approval","handler":{"roleCode":"marketing_manager"},"interactionType":"approval","signMode":"or"},{"order":2,"name":"往来会计审批","type":"approval","handler":{"roleCode":"current_accountant"},"interactionType":"approval","signMode":"or"},{"order":3,"name":"更新ERP客户授信","type":"auto"}]}'::jsonb
WHERE code = 'customer_credit';

-- 客户变更
UPDATE oa_form_types
SET workflow_def = '{"nodes":[{"order":1,"name":"营销经理审批","type":"approval","handler":{"roleCode":"marketing_manager"},"interactionType":"approval","signMode":"or"},{"order":2,"name":"更新ERP客户档案","type":"auto"}]}'::jsonb
WHERE code = 'customer_modify';

-- 催收
UPDATE oa_form_types
SET workflow_def = '{"nodes":[{"order":1,"name":"营销师催收","type":"approval","handler":{"roleCode":"marketer"},"interactionType":"operation","signMode":"or","timeout":{"durationMinutes":4320,"warningMinutes":1440}},{"order":2,"name":"更新催收状态","type":"auto"}]}'::jsonb
WHERE code = 'ar_collection';

-- 资产采购
UPDATE oa_form_types
SET workflow_def = '{"nodes":[{"order":1,"name":"需求提报","type":"approval","handler":{"roleCode":"admin"},"signMode":"or"},{"order":2,"name":"总经理审批","type":"approval","handler":{"roleCode":"admin"},"signMode":"or"},{"order":3,"name":"行政询价","type":"data_input","handler":{"roleCode":"admin_staff"},"condition":{"field":"estimatedCost","operator":">=","value":500},"inputSchema":{"fields":[{"name":"lines","label":"询价明细","type":"detail","fields":[{"name":"supplier","label":"供应商","type":"text","required":true},{"name":"quotedPrice","label":"报价(元)","type":"amount","required":true},{"name":"deliveryDays","label":"交货期(天)","type":"number","required":false},{"name":"remark","label":"备注","type":"text","required":false}]}]},"signMode":"or"},{"order":4,"name":"总经理审批","type":"approval","handler":{"roleCode":"admin"},"signMode":"or"},{"order":5,"name":"出纳支付","type":"data_input","handler":{"roleCode":"cashier"},"inputSchema":{"fields":[{"name":"paymentAmount","label":"支付金额","type":"amount","required":true},{"name":"paymentDate","label":"支付日期","type":"date","required":true}]},"signMode":"or"},{"order":6,"name":"行政采购","type":"data_input","handler":{"roleCode":"admin_staff"},"inputSchema":{"fields":[{"name":"purchaseDate","label":"采购日期","type":"date","required":true},{"name":"purchaseNote","label":"采购备注","type":"text","required":false}]},"signMode":"or"},{"order":7,"name":"资产入库","type":"data_input","handler":{"roleCode":"admin_staff"},"inputSchema":{"fields":[{"name":"lines","label":"入库明细","type":"detail","fields":[{"name":"assetName","label":"资产名称","type":"text","required":true},{"name":"quantity","label":"数量","type":"number","required":true},{"name":"unitPrice","label":"单价(元)","type":"amount","required":true},{"name":"location","label":"存放位置","type":"text","required":false}]}]},"signMode":"or"}]}'::jsonb
WHERE code = 'asset_purchase';

-- 资产转移
UPDATE oa_form_types
SET workflow_def = '{"nodes":[{"order":1,"name":"行政专员审批","type":"approval","handler":{"roleCode":"admin_staff"},"signMode":"or"}]}'::jsonb
WHERE code = 'asset_transfer';

-- 资产报废
UPDATE oa_form_types
SET workflow_def = '{"nodes":[{"order":1,"name":"总经理审批","type":"approval","handler":{"roleCode":"admin"},"signMode":"or"}]}'::jsonb
WHERE code = 'asset_disposal';

-- 资产维修
UPDATE oa_form_types
SET workflow_def = '{"nodes":[{"order":1,"name":"需求提报","type":"approval","handler":{"roleCode":"admin"},"signMode":"or"},{"order":2,"name":"行政询价","type":"data_input","handler":{"roleCode":"admin_staff"},"condition":{"field":"estimatedCost","operator":">=","value":500},"inputSchema":{"fields":[{"name":"lines","label":"询价明细","type":"detail","fields":[{"name":"repairVendor","label":"维修商","type":"text","required":true},{"name":"quotedPrice","label":"报价(元)","type":"amount","required":true},{"name":"repairDays","label":"预计天数","type":"number","required":false}]}]},"signMode":"or"},{"order":3,"name":"总经理审批","type":"approval","handler":{"roleCode":"admin"},"signMode":"or"},{"order":4,"name":"财务支付","type":"data_input","handler":{"roleCode":"cashier"},"inputSchema":{"fields":[{"name":"paymentAmount","label":"支付金额","type":"amount","required":true},{"name":"paymentDate","label":"支付日期","type":"date","required":true}]},"signMode":"or"}]}'::jsonb
WHERE code = 'asset_maintenance';

-- 考核申诉
UPDATE oa_form_types
SET workflow_def = '{"nodes":[{"order":1,"name":"总经理审批","type":"approval","handler":{"roleCode":"general_manager"},"signMode":"or"}]}'::jsonb
WHERE code = 'assessment_appeal';
