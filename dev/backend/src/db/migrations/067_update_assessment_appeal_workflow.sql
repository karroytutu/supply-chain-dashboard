-- 考核申诉审批流程调整：从"直属主管初审→部门负责人审核"改为"总经理审批"（单节点）
-- 同时迁移正在审批中的实例节点

BEGIN;

-- 前置检查：确保 general_manager 角色存在活跃用户
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    JOIN roles r ON ur.role_id = r.id
    WHERE r.code = 'general_manager' AND u.status = 1
  ) THEN
    RAISE EXCEPTION 'Migration aborted: no active user with role general_manager';
  END IF;
END $$;

-- ===== Part 1: 迁移在途审批实例节点 =====

-- 场景 1：当前在第 1 节点（直属主管）待审批的实例
-- 删除所有旧节点（未被操作过，无审计价值），然后插入新的总经理节点
-- 注意：必须 DELETE 而非 UPDATE cancelled，因为 (instance_id, node_order) 有唯一约束
DELETE FROM oa_approval_nodes
WHERE status = 'pending'
AND instance_id IN (
  SELECT oi.id FROM oa_approval_instances oi
  JOIN oa_form_types ft ON oi.form_type_id = ft.id
  WHERE ft.code = 'assessment_appeal'
    AND oi.status IN ('pending', 'processing')
    AND oi.current_node_order = 1
);

INSERT INTO oa_approval_nodes (
  instance_id, node_order, node_name, node_type, role_code,
  assigned_user_id, assigned_user_name, status, created_at, updated_at
)
SELECT
  oi.id, 1, '总经理审批', 'role', 'general_manager',
  gm.id, gm.name, 'pending', NOW(), NOW()
FROM oa_approval_instances oi
JOIN oa_form_types ft ON oi.form_type_id = ft.id
CROSS JOIN LATERAL (
  SELECT u.id, u.name
  FROM users u
  JOIN user_roles ur ON u.id = ur.user_id
  JOIN roles r ON ur.role_id = r.id
  WHERE r.code = 'general_manager' AND u.status = 1
  ORDER BY u.id LIMIT 1
) gm
WHERE ft.code = 'assessment_appeal'
  AND oi.status IN ('pending', 'processing')
  AND oi.current_node_order = 1;

-- 场景 2：第 1 节点已通过，正在第 2 节点（运营经理）待审批的实例
-- 删除 pending 状态的第 2 节点（避免 node_order 唯一约束冲突），保留已审批的第 1 节点
DELETE FROM oa_approval_nodes
WHERE instance_id IN (
  SELECT oi.id FROM oa_approval_instances oi
  JOIN oa_form_types ft ON oi.form_type_id = ft.id
  WHERE ft.code = 'assessment_appeal'
    AND oi.status IN ('pending', 'processing')
    AND oi.current_node_order = 2
)
AND node_order = 2
AND status = 'pending';

-- 插入新的总经理节点（order=2，保持已通过的第 1 节点不变）
INSERT INTO oa_approval_nodes (
  instance_id, node_order, node_name, node_type, role_code,
  assigned_user_id, assigned_user_name, status, created_at, updated_at
)
SELECT
  oi.id, 2, '总经理审批', 'role', 'general_manager',
  gm.id, gm.name, 'pending', NOW(), NOW()
FROM oa_approval_instances oi
JOIN oa_form_types ft ON oi.form_type_id = ft.id
CROSS JOIN LATERAL (
  SELECT u.id, u.name
  FROM users u
  JOIN user_roles ur ON u.id = ur.user_id
  JOIN roles r ON ur.role_id = r.id
  WHERE r.code = 'general_manager' AND u.status = 1
  ORDER BY u.id LIMIT 1
) gm
WHERE ft.code = 'assessment_appeal'
  AND oi.status IN ('pending', 'processing')
  AND oi.current_node_order = 2;

-- ===== Part 2: 更新表单类型定义 =====

UPDATE oa_form_types
SET workflow_def = '{"nodes":[
  {"order":1,"name":"总经理审批","type":"role","roleCode":"general_manager"}
]}'::jsonb,
  version = 3,
  updated_at = NOW()
WHERE code = 'assessment_appeal';

-- ===== Part 3: 审计记录 =====
-- 记录迁移对在途实例的节点变更

INSERT INTO oa_approval_actions (instance_id, action_type, operator_name, comment, details, action_at)
SELECT
  oi.id,
  'workflow_migration',
  'system',
  '考核申诉流程调整：从"直属主管初审→部门负责人审核"迁移为"总经理审批"（单节点）',
  jsonb_build_object('old_workflow', '2-node', 'new_workflow', '1-node', 'current_node', oi.current_node_order),
  NOW()
FROM oa_approval_instances oi
JOIN oa_form_types ft ON oi.form_type_id = ft.id
WHERE ft.code = 'assessment_appeal'
  AND oi.status IN ('pending', 'processing');

-- ===== Part 4: 站内通知 =====
-- 通知总经理有待审批的考核申诉实例

INSERT INTO oa_in_app_messages (user_id, type, title, content, instance_id, created_at)
SELECT
  gm_user.id,
  'approval_pending',
  '考核申诉待审批',
  '您有待审批的考核申诉（流程调整迁移），请及时处理。',
  oi.id,
  NOW()
FROM oa_approval_instances oi
JOIN oa_form_types ft ON oi.form_type_id = ft.id
CROSS JOIN (
  SELECT u.id
  FROM users u
  JOIN user_roles ur ON u.id = ur.user_id
  JOIN roles r ON ur.role_id = r.id
  WHERE r.code = 'general_manager' AND u.status = 1
) gm_user
WHERE ft.code = 'assessment_appeal'
  AND oi.status IN ('pending', 'processing');

COMMIT;
