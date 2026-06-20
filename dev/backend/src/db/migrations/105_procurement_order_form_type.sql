-- =====================================================
-- 105: 采购审批OA表单类型
-- 采购全生命周期审批：条件三级审批→付款分支→到货差异→多货子流程
-- =====================================================

-- 注意：form_schema 和 workflow_def 的权威定义在代码中
-- (dev/backend/src/services/oa/form-types/procurement-order.ts)
-- 此迁移仅为 oa_form_types 表提供元数据种子
-- OA查询服务有代码定义兜底，即使迁移未执行也不影响功能

INSERT INTO oa_form_types (code, name, icon, category, sort_order, description, form_schema, workflow_def, is_active, version)
VALUES (
  'procurement_order',
  '采购审批',
  'ShoppingOutlined',
  'supply_chain',
  50,
  '采购全生命周期审批：条件三级审批→付款分支→到货差异→多货子流程',
  '{"fields":[]}'::jsonb,
  '{"nodes":[
    {"order":1,"name":"营销审批","type":"approval","handler":{"roleCode":"marketing_manager"},"signMode":"or","condition":{"field":"_needsMarketingApproval","operator":"==","value":1}},
    {"order":2,"name":"财务审批","type":"approval","handler":{"roleCode":"current_accountant"},"signMode":"or","condition":{"field":"_needsFinanceApproval","operator":"==","value":1}},
    {"order":3,"name":"总经理审批","type":"approval","handler":{"roleCode":"general_manager"},"signMode":"or","condition":{"field":"_needsManagerApproval","operator":"==","value":1}},
    {"order":4,"name":"选择关联单据","type":"handle","handler":{"roleCode":"procurement_manager"},"signMode":"or","condition":{"field":"_paymentMethodCategory","operator":"==","value":"already_paid"}},
    {"order":5,"name":"创建付款单核销","type":"auto","condition":{"field":"_paymentMethodCategory","operator":"==","value":"already_paid"}},
    {"order":6,"name":"出纳付款","type":"handle","handler":{"roleCode":"cashier"},"signMode":"or","condition":{"field":"paymentMethod","operator":"==","value":"need_prepay"}},
    {"order":7,"name":"创建采购预付款","type":"auto","condition":{"field":"paymentMethod","operator":"==","value":"need_prepay"}},
    {"order":8,"name":"审核采购订单","type":"auto"},
    {"order":9,"name":"库管到货确认","type":"handle","handler":{"roleCode":"warehouse_manager"},"signMode":"or"},
    {"order":10,"name":"办结检查","type":"auto"}
  ],"ccRoles":["current_accountant"]}'::jsonb,
  true,
  1
)
ON CONFLICT (code) DO NOTHING;
