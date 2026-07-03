-- 172: 坏账处理 OA 表单类型种子数据
--
-- 新增坏账处理审批流程表单类型
-- 流程：选客户+应收单据 → 总经理审批 → 自动创建费用单 → 自动创建收款单核销
--
-- 注意：formSchema 和 workflowDef 由代码定义（bad-debt-write-off.ts），
-- 应用启动时 mapFormTypeRegistry 自动从代码同步到运行时，无需写入数据库

INSERT INTO oa_form_types (code, name, icon, category, sort_order, description,
  is_active, version, allowed_roles)
VALUES (
  'bad_debt_write_off',
  '坏账处理',
  'DeleteOutlined',
  'finance',
  110,
  '坏账核销处理：选择客户和应收单据，创建坏账费用单并通过收款单完成核销',
  true,
  1,
  ARRAY['marketer', 'current_accountant', 'cashier']::text[]
);
