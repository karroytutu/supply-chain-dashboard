-- =====================================================
-- 117: 催收流程从手动路由迁移为条件驱动
-- depends_on: 116
-- =====================================================
-- 背景：催收流程原先依赖 onApprovedArCollection 回调中的 routeToNode
-- 手动路由机制。现改为引擎条件重评估机制（approve-approval.ts 新增的
-- 条件重评估步骤），各环节通过 condition 字段自动激活/跳过。
--
-- 本脚本将所有在途催收实例一次性转换为新模式：
-- 1. 数据字段迁移：将旧 action/配套字段复制到 mgrAction/accAction 等独立字段
-- 2. 清理旧路由标记：移除 _currentEscalationLevel、_pendingAction、_extensionCount
-- 3. 重置节点状态：使条件引擎能够重新评估并正确流转

-- =====================================================
-- 步骤 A：数据字段迁移
-- =====================================================

-- A1: 已升级到营销经理(marketing_manager)的实例（_currentEscalationLevel >= 1）：
--     将 action/配套字段复制到 mgrAction/mgr配套字段
UPDATE oa_approval_instances i
SET form_data = form_data
  || jsonb_build_object(
    'mgrAction', form_data->'action',
    'mgrVerifyRemark', form_data->'verifyRemark',
    'mgrExtensionDays', form_data->'extensionDays',
    'mgrExtensionReason', form_data->'extensionReason',
    'mgrGuarantorSignature', form_data->'guarantorSignature',
    'mgrDifferenceRemark', form_data->'differenceRemark',
    'mgrEscalateReason', form_data->'escalateReason'
  )
WHERE i.form_type_id = (SELECT id FROM oa_form_types WHERE code = 'ar_collection')
  AND i.status IN ('pending', 'processing')
  AND (i.form_data->>'_currentEscalationLevel')::int >= 1;

-- A2: 已升级到往来会计(current_accountant)的实例（_currentEscalationLevel >= 2）：
--     将 action/配套字段复制到 accAction/acc配套字段
UPDATE oa_approval_instances i
SET form_data = form_data
  || jsonb_build_object(
    'accAction', form_data->'action',
    'accVerifyRemark', form_data->'verifyRemark',
    'accExtensionDays', form_data->'extensionDays',
    'accExtensionReason', form_data->'extensionReason',
    'accResolveDiffRemark', form_data->'resolveDiffRemark',
    'accLetterAttachment', form_data->'letterAttachment',
    'accDeliveryProof', form_data->'deliveryProof'
  )
WHERE i.form_type_id = (SELECT id FROM oa_form_types WHERE code = 'ar_collection')
  AND i.status IN ('pending', 'processing')
  AND (i.form_data->>'_currentEscalationLevel')::int >= 2;

-- =====================================================
-- 步骤 B：清理旧路由标记
-- =====================================================

-- B1: 移除 _currentEscalationLevel（不再需要，由条件节点驱动）
UPDATE oa_approval_instances
SET form_data = form_data - '_currentEscalationLevel'
WHERE form_type_id = (SELECT id FROM oa_form_types WHERE code = 'ar_collection')
  AND form_data ? '_currentEscalationLevel';

-- B2: 移除 _pendingAction（不再需要）
UPDATE oa_approval_instances
SET form_data = form_data - '_pendingAction'
WHERE form_type_id = (SELECT id FROM oa_form_types WHERE code = 'ar_collection')
  AND form_data ? '_pendingAction';

-- B3: 移除 _extensionCount（业务规则简化为"所有延期均需担保签字"，不再需要计数）
UPDATE oa_approval_instances
SET form_data = form_data - '_extensionCount'
WHERE form_type_id = (SELECT id FROM oa_form_types WHERE code = 'ar_collection')
  AND form_data ? '_extensionCount';

-- =====================================================
-- 步骤 C：重置节点状态以适配条件驱动
-- =====================================================

-- C1: 所有在途实例，将营销师(marketer)催收节点(node_order=1)设为 pending
--     （即使之前已 approved，迁移后也重新激活，让条件引擎重新评估）
UPDATE oa_approval_nodes n
SET status = 'pending', acted_at = NULL, reminder_count = 0
WHERE n.instance_id IN (
  SELECT i.id FROM oa_approval_instances i
  JOIN oa_form_types ft ON i.form_type_id = ft.id
  WHERE ft.code = 'ar_collection' AND i.status IN ('pending', 'processing')
)
AND n.node_order = 1;

-- C2: 如果 mgrAction 有值（已升级到经理），将营销经理(marketing_manager)节点(node_order=2)激活
UPDATE oa_approval_nodes n
SET status = 'pending', acted_at = NULL
WHERE n.instance_id IN (
  SELECT i.id FROM oa_approval_instances i
  JOIN oa_form_types ft ON i.form_type_id = ft.id
  WHERE ft.code = 'ar_collection' AND i.status IN ('pending', 'processing')
    AND i.form_data ? 'mgrAction' AND i.form_data->>'mgrAction' IS NOT NULL
)
AND n.node_order = 2 AND n.status = 'skipped';

-- C3: 如果 accAction 有值（已升级到会计），将往来会计(current_accountant)节点(node_order=3)激活
UPDATE oa_approval_nodes n
SET status = 'pending', acted_at = NULL
WHERE n.instance_id IN (
  SELECT i.id FROM oa_approval_instances i
  JOIN oa_form_types ft ON i.form_type_id = ft.id
  WHERE ft.code = 'ar_collection' AND i.status IN ('pending', 'processing')
    AND i.form_data ? 'accAction' AND i.form_data->>'accAction' IS NOT NULL
)
AND n.node_order = 3 AND n.status = 'skipped';

-- C4: 处理特殊状态的实例（差异处理、起诉立案、总经理审批延期中）
--     简化处理：将这些实例退回到营销师(marketer)环节重新处理
UPDATE oa_approval_instances i
SET current_node_order = 1, status = 'pending', updated_at = NOW()
WHERE i.form_type_id = (SELECT id FROM oa_form_types WHERE code = 'ar_collection')
  AND i.status IN ('pending', 'processing')
  AND i.current_node_order IN (4, 5, 6);

-- C5: 将 auto 节点(node_order=7)设为 skipped（新流程中 auto 节点由引擎管理）
UPDATE oa_approval_nodes n
SET status = 'skipped'
WHERE n.instance_id IN (
  SELECT i.id FROM oa_approval_instances i
  JOIN oa_form_types ft ON i.form_type_id = ft.id
  WHERE ft.code = 'ar_collection' AND i.status IN ('pending', 'processing')
)
AND n.node_order = 7 AND n.status IN ('pending', 'processing');

-- C6: 重置 processing 状态的实例回 pending，让条件引擎重新评估
UPDATE oa_approval_instances i
SET current_node_order = 1, status = 'pending', updated_at = NOW()
WHERE i.form_type_id = (SELECT id FROM oa_form_types WHERE code = 'ar_collection')
  AND i.status = 'processing';

-- =====================================================
-- 验证查询（执行后可选检查）
-- =====================================================

-- 验证1：所有在途实例不应有旧路由标记
-- SELECT COUNT(*) FROM oa_approval_instances i
-- JOIN oa_form_types ft ON i.form_type_id = ft.id
-- WHERE ft.code = 'ar_collection' AND i.status IN ('pending', 'processing')
--   AND (i.form_data ? '_currentEscalationLevel' OR i.form_data ? '_pendingAction' OR i.form_data ? '_extensionCount');
-- 预期：0

-- 验证2：所有在途实例的 current_node_order 应为 1
-- SELECT COUNT(*) FROM oa_approval_instances i
-- JOIN oa_form_types ft ON i.form_type_id = ft.id
-- WHERE ft.code = 'ar_collection' AND i.status IN ('pending', 'processing')
--   AND i.current_node_order != 1;
-- 预期：0

-- 验证3：所有在途实例的 auto 节点应为 skipped
-- SELECT COUNT(*) FROM oa_approval_nodes n
-- JOIN oa_approval_instances i ON n.instance_id = i.id
-- JOIN oa_form_types ft ON i.form_type_id = ft.id
-- WHERE ft.code = 'ar_collection' AND i.status IN ('pending', 'processing')
--   AND n.node_order = 7 AND n.status != 'skipped';
-- 预期：0
