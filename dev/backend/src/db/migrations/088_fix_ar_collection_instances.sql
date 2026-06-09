-- =====================================================
-- 088: 修复催收OA实例自动创建的历史缺陷
-- =====================================================
-- 问题背景：ar-collection-creator.ts 定时任务直接用SQL创建OA实例，
-- 绕过了正常的 submitApproval() 流程，导致：
-- 1. 发起人显示为 ID 最小的真实用户，而非「鑫小财(AI员工)」
-- 2. 营销师催收节点未分配审批人（缺少 assigned_user_id/name）
-- 3. 钉钉壳实例和待办未创建（需一次性 Node 脚本修复，见 scripts/fix-ar-collection-dingtalk.ts）
--
-- 幂等安全：通过 NOT LIKE / IS NULL 条件跳过已修复的记录
-- =====================================================

-- Step 1. 修复发起人显示错误
-- 将 ar_collection 实例中 applicant_name 不是「鑫小财」的实例，更新为鑫小财(AI员工)
UPDATE oa_approval_instances oi
SET applicant_id = xc.id,
    applicant_name = xc.name,
    applicant_dept = xc.department_name,
    updated_at = NOW()
FROM oa_form_types ft,
     LATERAL (
       SELECT u.id, u.name, d.name as department_name
       FROM users u
       LEFT JOIN dingtalk_departments d ON u.department_id = d.dingtalk_dept_id
       WHERE u.name LIKE '%鑫小财%' AND u.status = 1
       ORDER BY u.id
       LIMIT 1
     ) xc
WHERE oi.form_type_id = ft.id
  AND ft.code = 'ar_collection'
  AND oi.applicant_name NOT LIKE '%鑫小财%';

-- Step 2. 修复营销师未分配：精确匹配
-- 对 pending/processing 状态的实例，通过 form_data->>'managerName' 查找用户并回填
UPDATE oa_approval_nodes n
SET assigned_user_id = u.id,
    assigned_user_name = u.name,
    updated_at = NOW()
FROM oa_approval_instances oi
JOIN oa_form_types ft ON oi.form_type_id = ft.id
CROSS JOIN LATERAL (
  SELECT id, name FROM users
  WHERE name = oi.form_data->>'managerName' AND status = 1
  LIMIT 1
) u
WHERE ft.code = 'ar_collection'
  AND oi.status IN ('pending', 'processing')
  AND n.instance_id = oi.id
  AND n.node_name = '营销师催收'
  AND n.assigned_user_id IS NULL;

-- Step 3. 修复营销师未分配：fallback 到 marketing_manager 角色用户
-- 对精确匹配失败（assigned_user_id 仍为 NULL）的节点，分配给营销经理并记录原因
UPDATE oa_approval_nodes n
SET assigned_user_id = mm.id,
    assigned_user_name = mm.name,
    comment = COALESCE(
      '原营销师「' || (oi.form_data->>'managerName') || '」未匹配到系统用户，已转交营销经理处理',
      '欠款记录无营销师信息，已转交营销经理处理'
    ),
    updated_at = NOW()
FROM oa_approval_instances oi
JOIN oa_form_types ft ON oi.form_type_id = ft.id
CROSS JOIN LATERAL (
  SELECT u.id, u.name
  FROM user_roles ur
  JOIN roles r ON r.id = ur.role_id
  JOIN users u ON u.id = ur.user_id
  WHERE r.code = 'marketing_manager' AND r.status = 1 AND u.status = 1
  ORDER BY u.id
  LIMIT 1
) mm
WHERE ft.code = 'ar_collection'
  AND oi.status IN ('pending', 'processing')
  AND n.instance_id = oi.id
  AND n.node_name = '营销师催收'
  AND n.assigned_user_id IS NULL;

-- Step 4. 钉钉壳实例和待办需通过一次性 Node 脚本修复
-- 见 dev/backend/scripts/fix-ar-collection-dingtalk.ts
