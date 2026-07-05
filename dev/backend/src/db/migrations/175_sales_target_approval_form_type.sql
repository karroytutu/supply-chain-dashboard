-- 注册销售目标审批表单类型到 oa_form_types
-- 注意：formSchema 和 workflowDef 由代码定义（sales-target-approval.ts），
-- 应用启动时 mapFormTypeRegistry 自动从代码同步到运行时，无需写入数据库

INSERT INTO oa_form_types (code, name, icon, category, sort_order, description,
  is_active, version, allowed_roles)
VALUES (
  'sales_target_approval',
  '销售目标审批',
  'AimOutlined',
  'marketing',
  200,
  '营销师月度销售目标的制定与审批',
  true,
  1,
  ARRAY['marketing_manager']
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  sort_order = EXCLUDED.sort_order,
  description = EXCLUDED.description,
  allowed_roles = EXCLUDED.allowed_roles,
  updated_at = NOW();

-- DOWN: 回滚逻辑
-- DELETE FROM oa_form_types WHERE code = 'sales_target_approval';
