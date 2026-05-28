-- 简化客户授信审批流程：取消分级审批，统一为 营销经理 → 往来会计 → auto
-- 抄送：总经理（固定）
-- 迁移在途 pending 审批单到新流程

BEGIN;

-- ===== Part 1: 在途审批实例迁移 =====

-- Step 1: 删除在途实例中 pending 状态的总经理审批节点
-- 原因：oa_approval_nodes 有 (instance_id, node_order) 唯一约束，
-- 必须删除 GM 节点（order=3）后才能将 auto 节点从 order=4 重排为 order=3
-- 这些 pending 状态的 GM 节点从未被操作，删除不影响审计记录
DELETE FROM oa_approval_nodes
WHERE instance_id IN (
  SELECT i.id FROM oa_approval_instances i
  JOIN oa_form_types ft ON i.form_type_id = ft.id
  WHERE ft.code = 'customer_credit' AND i.status = 'pending'
)
AND node_name = '总经理审批'
AND status = 'pending';

-- Step 2: 将在途实例的 auto 节点 order 从 4 改为 3
-- 确保审批流转时 auto 节点紧跟在往来会计节点之后
UPDATE oa_approval_nodes
SET node_order = 3, updated_at = NOW()
WHERE instance_id IN (
  SELECT i.id FROM oa_approval_instances i
  JOIN oa_form_types ft ON i.form_type_id = ft.id
  WHERE ft.code = 'customer_credit' AND i.status = 'pending'
)
AND node_type = 'auto'
AND node_order = 4;

-- Step 3: 为在途实例添加总经理抄送（ON CONFLICT 避免重复插入）
INSERT INTO oa_approval_cc (instance_id, user_id, user_name)
SELECT i.id, u.id, u.name
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
CROSS JOIN (
  SELECT u.id, u.name FROM users u
  JOIN user_roles ur ON u.id = ur.user_id
  JOIN roles r ON ur.role_id = r.id
  WHERE r.code = 'general_manager' AND u.status = 1
) u
WHERE ft.code = 'customer_credit' AND i.status = 'pending'
ON CONFLICT (instance_id, user_id) DO NOTHING;

-- Step 4: 为在途实例添加往来会计抄送（部分实例可能缺少此抄送）
INSERT INTO oa_approval_cc (instance_id, user_id, user_name)
SELECT i.id, u.id, u.name
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
CROSS JOIN (
  SELECT u.id, u.name FROM users u
  JOIN user_roles ur ON u.id = ur.user_id
  JOIN roles r ON ur.role_id = r.id
  WHERE r.code = 'current_accountant' AND u.status = 1
) u
WHERE ft.code = 'customer_credit' AND i.status = 'pending'
ON CONFLICT (instance_id, user_id) DO NOTHING;

-- ===== Part 2: 更新表单类型定义 =====

UPDATE oa_form_types
SET workflow_def = '{"nodes":[
  {"order":1,"name":"营销经理审批","type":"role","roleCode":"marketing_manager"},
  {"order":2,"name":"往来会计审批","type":"role","roleCode":"current_accountant"},
  {"order":3,"name":"更新ERP客户授信","type":"auto"}
]}'::jsonb,
  version = 5,
  updated_at = NOW()
WHERE code = 'customer_credit';

COMMIT;
