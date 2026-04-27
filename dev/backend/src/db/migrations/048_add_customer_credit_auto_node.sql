-- 更新客户授信申请的 workflow_def：添加第4个 auto 节点（更新ERP客户授信）
-- 代码定义 customer-credit.ts 已包含此节点，但数据库中的 workflow_def 仍为旧版3节点
UPDATE oa_form_types
SET workflow_def = '{"nodes":[{"order":1,"name":"营销主管","type":"role","roleCode":"marketing_manager","condition":{"field":"_submitterRole","operator":"==","value":"marketer"}},{"order":2,"name":"往来会计","type":"role","roleCode":"current_accountant","condition":{"field":"_submitterRole","operator":"==","value":"marketer"}},{"order":3,"name":"总经理","type":"role","roleCode":"general_manager"},{"order":4,"name":"更新ERP客户授信","type":"auto"}]}',
  version = 2,
  updated_at = NOW()
WHERE code = 'customer_credit';
