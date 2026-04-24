-- 注册客户授信申请表单类型到 oa_form_types
-- 使用 UPSERT 确保可重复执行
INSERT INTO oa_form_types (code, name, icon, category, sort_order, description, form_schema, workflow_def, is_active, version)
VALUES (
  'customer_credit',
  '客户授信申请',
  'SafetyCertificateOutlined',
  'finance',
  110,
  '申请客户授信，包括账期、滚单、压单',
  '{"fields":[{"key":"customer","label":"客户","type":"erp_customer","required":true,"searchApi":"erp_customers","autoFill":{"customerName":"name","customerCode":"consumerCode"}},{"key":"customerName","label":"客户名称","type":"text","required":false,"disabled":true},{"key":"customerCode","label":"客户编码","type":"text","required":false,"disabled":true},{"key":"creditType","label":"授信类型","type":"select","required":true,"options":[{"value":"payment_period","label":"账期"},{"value":"rolling_order","label":"滚单"},{"value":"hold_order","label":"压单"}]},{"key":"maxOverdueDays","label":"最大欠款天数","type":"number","required":true,"min":1,"suffix":"天","visibleWhen":{"field":"creditType","operator":"==","value":"payment_period"},"requiredWhen":{"field":"creditType","operator":"==","value":"payment_period"}},{"key":"rollingMaxOverdueDays","label":"最大欠款天数","type":"number","required":true,"min":1,"suffix":"天","visibleWhen":{"field":"creditType","operator":"==","value":"rolling_order"},"requiredWhen":{"field":"creditType","operator":"==","value":"rolling_order"}},{"key":"rollingMaxOverdueOrders","label":"最大欠款单数","type":"number","required":true,"min":1,"suffix":"单","visibleWhen":{"field":"creditType","operator":"==","value":"rolling_order"},"requiredWhen":{"field":"creditType","operator":"==","value":"rolling_order"}},{"key":"holdSettlementOrders","label":"选择压单结算单","type":"erp_settlement_order","required":true,"searchApi":"erp_settlement_orders","multiple":true,"cascadeFrom":"customer","visibleWhen":{"field":"creditType","operator":"==","value":"hold_order"},"requiredWhen":{"field":"creditType","operator":"==","value":"hold_order"}},{"key":"businessLicensePhotos","label":"客户营业执照","type":"photo","required":true,"maxCount":3},{"key":"remark","label":"备注","type":"textarea","required":false,"maxLength":500}]}',
  '{"nodes":[{"order":1,"name":"营销主管","type":"role","roleCode":"marketing_manager","condition":{"field":"_submitterRole","operator":"==","value":"marketer"}},{"order":2,"name":"往来会计","type":"role","roleCode":"current_accountant","condition":{"field":"_submitterRole","operator":"==","value":"marketer"}},{"order":3,"name":"总经理","type":"role","roleCode":"general_manager"}]}',
  true,
  1
) ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order,
  description = EXCLUDED.description,
  form_schema = EXCLUDED.form_schema,
  workflow_def = EXCLUDED.workflow_def,
  version = EXCLUDED.version,
  updated_at = NOW();
