-- 修复催收 OA 中动态插入的环节未指定处理人的问题
-- 背景：insertCollectionNode 创建新环节时遗漏了指定处理人，导致流程卡死
-- 本脚本为仍在进行中的流程补上处理人
--
-- 注意：当同一角色有多个活跃用户时，DISTINCT ON + ORDER BY us.id 选择 user_id 最小的用户
-- 这与 resolveApproverId() 的逻辑保持一致（同样取第一个匹配用户）

UPDATE oa_approval_nodes n
SET assigned_user_id = u.user_id,
    assigned_user_name = u.user_name,
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (r.code)
    ur.user_id,
    us.name AS user_name,
    r.code AS role_code
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  JOIN users us ON us.id = ur.user_id
  WHERE r.status = 1 AND us.status = 1
  ORDER BY r.code, us.id
) u,
oa_approval_instances i
WHERE i.id = n.instance_id
  AND n.node_type = 'role'
  AND n.assigned_user_id IS NULL
  AND n.status = 'pending'
  AND n.role_code IS NOT NULL
  AND n.role_code = u.role_code
  AND i.status IN ('pending', 'processing');
