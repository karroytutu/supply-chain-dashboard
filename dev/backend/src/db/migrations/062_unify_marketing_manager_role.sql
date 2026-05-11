-- 统一营销管理角色口径：
-- 1. 仅保留 marketing_manager 作为当前有效角色编码
-- 2. 将 marketing_manager 的名称统一为“营销经理”
-- 3. 将历史 marketing_supervisor 关联数据迁移到 marketing_manager
-- 4. 将考核记录中的历史角色值 marketing_supervisor 迁移为 marketing_manager
-- 5. 将客户授信 OA 表单中的节点名称统一为“营销经理审批”

BEGIN;

-- 1. 统一 marketing_manager 的角色名称与描述
UPDATE roles
SET
  name = '营销经理',
  description = '负责营销管理、催收管理和相关审批',
  updated_at = NOW()
WHERE code = 'marketing_manager';

-- 2. 如数据库中仍残留 marketing_supervisor，迁移其用户与权限关联后删除
DO $$
DECLARE
  supervisor_role_id INTEGER;
  manager_role_id INTEGER;
BEGIN
  SELECT id INTO supervisor_role_id
  FROM roles
  WHERE code = 'marketing_supervisor'
  LIMIT 1;

  SELECT id INTO manager_role_id
  FROM roles
  WHERE code = 'marketing_manager'
  LIMIT 1;

  IF supervisor_role_id IS NOT NULL AND manager_role_id IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT manager_role_id, permission_id
    FROM role_permissions
    WHERE role_id = supervisor_role_id
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    INSERT INTO user_roles (user_id, role_id)
    SELECT user_id, manager_role_id
    FROM user_roles
    WHERE role_id = supervisor_role_id
    ON CONFLICT (user_id, role_id) DO NOTHING;

    DELETE FROM user_roles WHERE role_id = supervisor_role_id;
    DELETE FROM role_permissions WHERE role_id = supervisor_role_id;
    DELETE FROM roles WHERE id = supervisor_role_id;
  END IF;
END $$;

-- 3. 将统一考核表中的历史角色值迁移为 marketing_manager
DO $$
BEGIN
  IF to_regclass('public.assessment_records') IS NOT NULL THEN
    UPDATE assessment_records
    SET assessment_role = 'marketing_manager'
    WHERE assessment_role = 'marketing_supervisor';
  END IF;

  IF to_regclass('public.ar_assessment_records') IS NOT NULL THEN
    UPDATE ar_assessment_records
    SET assessment_role = 'marketing_manager'
    WHERE assessment_role = 'marketing_supervisor';
  END IF;

  IF to_regclass('public.ar_assessment_records_deprecated') IS NOT NULL THEN
    UPDATE ar_assessment_records_deprecated
    SET assessment_role = 'marketing_manager'
    WHERE assessment_role = 'marketing_supervisor';
  END IF;
END $$;

-- 4. 统一客户授信 OA 表单中的审批节点名称
UPDATE oa_form_types
SET
  workflow_def = '{
    "nodes": [
      {
        "order": 1,
        "name": "营销经理审批",
        "type": "role",
        "roleCode": "marketing_manager",
        "condition": { "field": "_needsManagerApproval", "operator": "==", "value": "yes" }
      },
      {
        "order": 2,
        "name": "往来会计审批",
        "type": "role",
        "roleCode": "current_accountant",
        "condition": { "field": "_needsAccountantApproval", "operator": "==", "value": "yes" }
      },
      {
        "order": 3,
        "name": "总经理审批",
        "type": "role",
        "roleCode": "general_manager",
        "condition": { "field": "_needsGmApproval", "operator": "==", "value": "yes" }
      },
      {
        "order": 4,
        "name": "更新ERP客户授信",
        "type": "auto"
      }
    ]
  }'::jsonb,
  version = GREATEST(COALESCE(version, 0), 4),
  updated_at = NOW()
WHERE code = 'customer_credit';

COMMIT;
