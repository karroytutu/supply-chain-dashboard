-- 催收流程退回机制重构：活跃实例数据迁移
-- 将动态插入的旧节点结构转换为7个预定义节点结构
-- 迁移对象：544个 pending 状态的 ar_collection 实例
--
-- ⚠️ 部署说明：迁移 116-121 必须在同一次部署中连续执行，不可分批

BEGIN;

-- =====================================================
-- 步骤 1：初始化 form_data 条件字段
-- =====================================================

-- 为所有缺少 _currentEscalationLevel 的活跃实例添加默认值 0
UPDATE oa_approval_instances
SET form_data = jsonb_set(form_data, '{_currentEscalationLevel}', '0')
WHERE form_type_id = (SELECT id FROM oa_form_types WHERE code = 'ar_collection')
  AND status IN ('pending', 'processing')
  AND form_data->>'_currentEscalationLevel' IS NULL;

-- 为所有缺少 _pendingAction 的活跃实例添加默认值空字符串
UPDATE oa_approval_instances
SET form_data = jsonb_set(form_data, '{_pendingAction}', '""')
WHERE form_type_id = (SELECT id FROM oa_form_types WHERE code = 'ar_collection')
  AND status IN ('pending', 'processing')
  AND form_data->>'_pendingAction' IS NULL;

-- =====================================================
-- 步骤 2：根据已有动态节点推断当前层级
-- =====================================================

-- 有"营销经理催收"动态节点 → level=1
UPDATE oa_approval_instances i
SET form_data = jsonb_set(form_data, '{_currentEscalationLevel}', '1')
WHERE i.form_type_id = (SELECT id FROM oa_form_types WHERE code = 'ar_collection')
  AND i.status IN ('pending', 'processing')
  AND EXISTS (
    SELECT 1 FROM oa_approval_nodes n
    WHERE n.instance_id = i.id AND n.node_name = '营销经理催收'
      AND n.status IN ('pending', 'processing', 'approved')
  );

-- 有"往来会计催收"动态节点 → level=2
UPDATE oa_approval_instances i
SET form_data = jsonb_set(form_data, '{_currentEscalationLevel}', '2')
WHERE i.form_type_id = (SELECT id FROM oa_form_types WHERE code = 'ar_collection')
  AND i.status IN ('pending', 'processing')
  AND EXISTS (
    SELECT 1 FROM oa_approval_nodes n
    WHERE n.instance_id = i.id AND n.node_name = '往来会计催收'
      AND n.status IN ('pending', 'processing', 'approved')
  );

-- 有"财务差异处理"动态节点 → _pendingAction='difference'
UPDATE oa_approval_instances i
SET form_data = jsonb_set(form_data, '{_pendingAction}', '"difference"')
WHERE i.form_type_id = (SELECT id FROM oa_form_types WHERE code = 'ar_collection')
  AND i.status IN ('pending', 'processing')
  AND EXISTS (
    SELECT 1 FROM oa_approval_nodes n
    WHERE n.instance_id = i.id AND n.node_name = '财务差异处理'
      AND n.status IN ('pending', 'processing')
  );

-- 有"起诉立案"动态节点 → _pendingAction='lawsuit'
UPDATE oa_approval_instances i
SET form_data = jsonb_set(form_data, '{_pendingAction}', '"lawsuit"')
WHERE i.form_type_id = (SELECT id FROM oa_form_types WHERE code = 'ar_collection')
  AND i.status IN ('pending', 'processing')
  AND EXISTS (
    SELECT 1 FROM oa_approval_nodes n
    WHERE n.instance_id = i.id AND n.node_name = '起诉立案'
      AND n.status IN ('pending', 'processing')
  );

-- 有"总经理审批延期"动态节点 → _pendingAction='gm_extension'
UPDATE oa_approval_instances i
SET form_data = jsonb_set(form_data, '{_pendingAction}', '"gm_extension"')
WHERE i.form_type_id = (SELECT id FROM oa_form_types WHERE code = 'ar_collection')
  AND i.status IN ('pending', 'processing')
  AND EXISTS (
    SELECT 1 FROM oa_approval_nodes n
    WHERE n.instance_id = i.id AND n.node_name = '总经理审批延期'
      AND n.status IN ('pending', 'processing')
  );

-- =====================================================
-- 步骤 3：为每个活跃实例添加缺失的预定义节点
-- =====================================================

-- 添加"营销经理催收"节点（order=2，如果不存在）
INSERT INTO oa_approval_nodes (instance_id, node_order, node_name, node_type, role_code, status, sign_mode)
SELECT i.id, 2, '营销经理催收', 'approval', 'marketing_manager', 'skipped', 'or'
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE ft.code = 'ar_collection'
  AND i.status IN ('pending', 'processing')
  AND NOT EXISTS (
    SELECT 1 FROM oa_approval_nodes n WHERE n.instance_id = i.id AND n.node_order = 2
  );

-- 添加"往来会计催收"节点（order=3，如果不存在）
INSERT INTO oa_approval_nodes (instance_id, node_order, node_name, node_type, role_code, status, sign_mode)
SELECT i.id, 3, '往来会计催收', 'approval', 'current_accountant', 'skipped', 'or'
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE ft.code = 'ar_collection'
  AND i.status IN ('pending', 'processing')
  AND NOT EXISTS (
    SELECT 1 FROM oa_approval_nodes n WHERE n.instance_id = i.id AND n.node_order = 3
  );

-- 添加"财务差异处理"节点（order=4，如果不存在）
INSERT INTO oa_approval_nodes (instance_id, node_order, node_name, node_type, role_code, status, sign_mode)
SELECT i.id, 4, '财务差异处理', 'approval', 'current_accountant', 'skipped', 'or'
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE ft.code = 'ar_collection'
  AND i.status IN ('pending', 'processing')
  AND NOT EXISTS (
    SELECT 1 FROM oa_approval_nodes n WHERE n.instance_id = i.id AND n.node_order = 4
  );

-- 添加"起诉立案"节点（order=5，如果不存在）
INSERT INTO oa_approval_nodes (instance_id, node_order, node_name, node_type, role_code, status, sign_mode)
SELECT i.id, 5, '起诉立案', 'approval', 'current_accountant', 'skipped', 'or'
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE ft.code = 'ar_collection'
  AND i.status IN ('pending', 'processing')
  AND NOT EXISTS (
    SELECT 1 FROM oa_approval_nodes n WHERE n.instance_id = i.id AND n.node_order = 5
  );

-- 添加"总经理审批延期"节点（order=6，如果不存在）
INSERT INTO oa_approval_nodes (instance_id, node_order, node_name, node_type, role_code, status, sign_mode)
SELECT i.id, 6, '总经理审批延期', 'approval', 'general_manager', 'skipped', 'or'
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE ft.code = 'ar_collection'
  AND i.status IN ('pending', 'processing')
  AND NOT EXISTS (
    SELECT 1 FROM oa_approval_nodes n WHERE n.instance_id = i.id AND n.node_order = 6
  );

-- =====================================================
-- 步骤 4：将动态插入的旧节点标记为 cancelled
-- =====================================================

-- 将所有不在预定义7个节点中（order > 7 或动态插入的额外节点）标记为 cancelled
-- 注意：保留 order=1（营销师催收）和最后一个 auto 节点（更新催收状态）
UPDATE oa_approval_nodes n
SET status = 'cancelled'
WHERE n.instance_id IN (
  SELECT i.id FROM oa_approval_instances i
  JOIN oa_form_types ft ON i.form_type_id = ft.id
  WHERE ft.code = 'ar_collection' AND i.status IN ('pending', 'processing')
)
AND n.node_order > 7
AND n.status IN ('pending', 'processing');

-- 将旧的"更新催收状态"auto 节点（原来在 order=2）移到 order=7
-- 先检查是否有 auto 节点不在 order=7 的情况
UPDATE oa_approval_nodes n
SET node_order = 7
WHERE n.instance_id IN (
  SELECT i.id FROM oa_approval_instances i
  JOIN oa_form_types ft ON i.form_type_id = ft.id
  WHERE ft.code = 'ar_collection' AND i.status IN ('pending', 'processing')
)
AND n.node_type = 'auto'
AND n.node_order != 7
AND n.status IN ('pending', 'processing')
AND NOT EXISTS (
  -- 确保 order=7 位置没有其他节点
  SELECT 1 FROM oa_approval_nodes n2
  WHERE n2.instance_id = n.instance_id AND n2.node_order = 7 AND n2.status IN ('pending', 'processing')
);

-- =====================================================
-- 步骤 5：根据条件激活应激活的节点
-- =====================================================

-- _currentEscalationLevel >= 1 → 激活"营销经理催收"（order=2）
UPDATE oa_approval_nodes n
SET status = 'pending'
WHERE n.instance_id IN (
  SELECT i.id FROM oa_approval_instances i
  JOIN oa_form_types ft ON i.form_type_id = ft.id
  WHERE ft.code = 'ar_collection'
    AND i.status IN ('pending', 'processing')
    AND (i.form_data->>'_currentEscalationLevel')::int >= 1
)
AND n.node_order = 2
AND n.status = 'skipped';

-- _currentEscalationLevel >= 2 → 激活"往来会计催收"（order=3）
UPDATE oa_approval_nodes n
SET status = 'pending'
WHERE n.instance_id IN (
  SELECT i.id FROM oa_approval_instances i
  JOIN oa_form_types ft ON i.form_type_id = ft.id
  WHERE ft.code = 'ar_collection'
    AND i.status IN ('pending', 'processing')
    AND (i.form_data->>'_currentEscalationLevel')::int >= 2
)
AND n.node_order = 3
AND n.status = 'skipped';

-- _pendingAction='difference' → 激活"财务差异处理"（order=4）
UPDATE oa_approval_nodes n
SET status = 'pending'
WHERE n.instance_id IN (
  SELECT i.id FROM oa_approval_instances i
  JOIN oa_form_types ft ON i.form_type_id = ft.id
  WHERE ft.code = 'ar_collection'
    AND i.status IN ('pending', 'processing')
    AND i.form_data->>'_pendingAction' = 'difference'
)
AND n.node_order = 4
AND n.status = 'skipped';

-- _pendingAction='lawsuit' → 激活"起诉立案"（order=5）
UPDATE oa_approval_nodes n
SET status = 'pending'
WHERE n.instance_id IN (
  SELECT i.id FROM oa_approval_instances i
  JOIN oa_form_types ft ON i.form_type_id = ft.id
  WHERE ft.code = 'ar_collection'
    AND i.status IN ('pending', 'processing')
    AND i.form_data->>'_pendingAction' = 'lawsuit'
)
AND n.node_order = 5
AND n.status = 'skipped';

-- _pendingAction='gm_extension' → 激活"总经理审批延期"（order=6）
UPDATE oa_approval_nodes n
SET status = 'pending'
WHERE n.instance_id IN (
  SELECT i.id FROM oa_approval_instances i
  JOIN oa_form_types ft ON i.form_type_id = ft.id
  WHERE ft.code = 'ar_collection'
    AND i.status IN ('pending', 'processing')
    AND i.form_data->>'_pendingAction' = 'gm_extension'
)
AND n.node_order = 6
AND n.status = 'skipped';

COMMIT;

-- =====================================================
-- 验证查询（迁移后执行，确认结果）
-- =====================================================

-- 验证1：所有活跃实例应有至少 7 个预定义节点
-- SELECT i.id, COUNT(*) as node_count
-- FROM oa_approval_instances i
-- JOIN oa_form_types ft ON i.form_type_id = ft.id
-- JOIN oa_approval_nodes n ON n.instance_id = i.id
-- WHERE ft.code = 'ar_collection' AND i.status IN ('pending', 'processing')
-- GROUP BY i.id HAVING COUNT(*) < 7;
-- 预期：0 行

-- 验证2：_currentEscalationLevel 已初始化
-- SELECT COUNT(*) FROM oa_approval_instances i
-- JOIN oa_form_types ft ON i.form_type_id = ft.id
-- WHERE ft.code = 'ar_collection' AND i.status IN ('pending', 'processing')
--   AND i.form_data->>'_currentEscalationLevel' IS NULL;
-- 预期：0
