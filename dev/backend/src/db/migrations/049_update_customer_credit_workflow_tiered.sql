-- 更新客户授信申请的 workflow_def：分级审批流
-- 账期/滚单：≤30天=low(仅营销主管), 30-60天=medium(+往来会计), >60天=high(+总经理)
-- 压单：≤500=low(仅营销主管), 500-1000=medium(+往来会计), >1000=high(+总经理)
-- 提交人自跳过：marketing_manager 跳过节点1，current_accountant 跳过节点2
-- 抄送角色改为动态解析（由 getCCRoles 回调处理），移除 workflowDef 中的静态 ccRoles
UPDATE oa_form_types
SET workflow_def = '{"nodes":[{"order":1,"name":"营销主管审批","type":"role","roleCode":"marketing_manager","condition":{"field":"_needsManagerApproval","operator":"==","value":"yes"}},{"order":2,"name":"往来会计审批","type":"role","roleCode":"current_accountant","condition":{"field":"_needsAccountantApproval","operator":"==","value":"yes"}},{"order":3,"name":"总经理审批","type":"role","roleCode":"general_manager","condition":{"field":"_needsGmApproval","operator":"==","value":"yes"}},{"order":4,"name":"更新ERP客户授信","type":"auto"}]}',
  version = 3,
  updated_at = NOW()
WHERE code = 'customer_credit';
