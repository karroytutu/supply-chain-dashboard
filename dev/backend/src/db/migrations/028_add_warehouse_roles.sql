-- 仓储执行考核角色确认
-- 用于规则5：仓储执行超时考核
-- 注意：库管员角色代码为 warehouse_operator（已存在），仓储主管为 warehouse_manager

-- ============================================
-- 确认仓储执行考核所需角色已存在
-- ============================================
DO $$
DECLARE
  operator_count INTEGER;
  manager_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO operator_count FROM roles WHERE code = 'warehouse_operator';
  SELECT COUNT(*) INTO manager_count FROM roles WHERE code = 'warehouse_manager';

  IF operator_count = 0 THEN
    RAISE EXCEPTION '库管员角色不存在: warehouse_operator';
  END IF;

  IF manager_count = 0 THEN
    RAISE EXCEPTION '仓储主管角色不存在: warehouse_manager';
  END IF;

  RAISE NOTICE '仓储执行考核角色检查完成: warehouse_operator(库管员), warehouse_manager(仓储主管)';
END $$;
