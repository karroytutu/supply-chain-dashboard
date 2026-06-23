-- 127_auto_node_restructure.sql
-- 统一 ERP 操作为 auto 节点：在途实例精确迁移
--
-- 迁移原则：保留已完成的审批环节进度，仅为每个实例插入尚未走到的新 auto 节点，并顺延后续节点。
-- 执行前请先备份 oa_approval_nodes 表。

BEGIN;

-- 前置校验：确保 126 已执行
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM migrations_history WHERE filename LIKE '126_%') THEN
    RAISE EXCEPTION '迁移 127 依赖 126，请先执行 126_field_permissions_full_migration.sql';
  END IF;
END $$;

-- =====================================================
-- 1. asset_purchase: 旧8节点 → 新10节点
--    旧: 1需求提报 2总经理 3询价 4总经理 5出纳支付 6行政采购 7资产入库 8抄送
--    新: 1需求提报 2总经理 3询价 4总经理 5出纳支付 6创建费用单(auto) 7行政采购 8资产入库 9创建资产卡片(auto) 10抄送
-- =====================================================

-- 1a. 所有 asset_purchase 在途实例：旧节点6→7, 7→8, 8→10（倒序更新避免冲突）
UPDATE oa_approval_nodes n
SET node_order = CASE n.node_order
  WHEN 6 THEN 7
  WHEN 7 THEN 8
  WHEN 8 THEN 10
END
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE n.instance_id = i.id
  AND ft.code = 'asset_purchase'
  AND i.status IN ('pending', 'processing')
  AND n.node_order IN (6, 7, 8);

-- 1b. 尚未到达出纳支付环节的实例（节点1-5）：插入 auto 节点6（创建费用单）和 auto 节点9（创建资产卡片）
INSERT INTO oa_approval_nodes (instance_id, node_order, node_name, node_type, status, round)
SELECT i.id, 6, '创建费用单', 'auto', 'pending', 1
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE ft.code = 'asset_purchase'
  AND i.status IN ('pending', 'processing')
  AND i.current_node_order < 6;

INSERT INTO oa_approval_nodes (instance_id, node_order, node_name, node_type, status, round)
SELECT i.id, 9, '创建资产卡片', 'auto', 'pending', 1
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE ft.code = 'asset_purchase'
  AND i.status IN ('pending', 'processing')
  AND i.current_node_order < 6;

-- 1c. 已到节点6的实例（ERP费用单已由旧回调创建）：仅插入 auto 节点9（创建资产卡片）
INSERT INTO oa_approval_nodes (instance_id, node_order, node_name, node_type, status, round)
SELECT i.id, 9, '创建资产卡片', 'auto', 'pending', 1
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE ft.code = 'asset_purchase'
  AND i.status IN ('pending', 'processing')
  AND i.current_node_order >= 6;

-- 1d. 更新实例的 current_node_order（如果被顺延）
-- 旧节点6→7, 7→8, 8→10
UPDATE oa_approval_instances i
SET current_node_order = CASE i.current_node_order
  WHEN 6 THEN 7
  WHEN 7 THEN 8
  WHEN 8 THEN 10
  ELSE i.current_node_order
END
FROM oa_form_types ft
WHERE i.form_type_id = ft.id
  AND ft.code = 'asset_purchase'
  AND i.status IN ('pending', 'processing')
  AND i.current_node_order IN (6, 7, 8);

-- =====================================================
-- 2. asset_maintenance: 旧5节点 → 新6节点
--    旧: 1需求提报 2询价 3总经理 4财务支付 5抄送
--    新: 1需求提报 2询价 3总经理 4财务支付 5创建费用单(auto) 6抄送
-- =====================================================

-- 2a. 所有 asset_maintenance 在途实例：旧节点5→6
UPDATE oa_approval_nodes n
SET node_order = 6
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE n.instance_id = i.id
  AND ft.code = 'asset_maintenance'
  AND i.status IN ('pending', 'processing')
  AND n.node_order = 5;

-- 2b. 插入 auto 节点5（创建费用单）
INSERT INTO oa_approval_nodes (instance_id, node_order, node_name, node_type, status, round)
SELECT i.id, 5, '创建费用单', 'auto', 'pending', 1
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE ft.code = 'asset_maintenance'
  AND i.status IN ('pending', 'processing');

-- 2c. 更新实例的 current_node_order（旧节点5→6）
UPDATE oa_approval_instances i
SET current_node_order = 6
FROM oa_form_types ft
WHERE i.form_type_id = ft.id
  AND ft.code = 'asset_maintenance'
  AND i.status IN ('pending', 'processing')
  AND i.current_node_order = 5;

-- =====================================================
-- 3. asset_disposal: 旧1节点 → 新2节点
--    旧: 1总经理审批
--    新: 1总经理审批 2创建清理单(auto)
-- =====================================================

-- 3a. 插入 auto 节点2（创建清理单）
INSERT INTO oa_approval_nodes (instance_id, node_order, node_name, node_type, status, round)
SELECT i.id, 2, '创建清理单', 'auto', 'pending', 1
FROM oa_approval_instances i
JOIN oa_form_types ft ON i.form_type_id = ft.id
WHERE ft.code = 'asset_disposal'
  AND i.status IN ('pending', 'processing');

-- =====================================================
-- 4. 更新 oa_form_types 的 workflow_def JSON（使新实例使用新节点结构）
-- =====================================================

-- 4a. asset_purchase: 更新 workflow_def
UPDATE oa_form_types
SET workflow_def = '{
  "nodes": [
    {"order":1,"name":"需求提报","type":"approval","handler":{"roleCode":"admin"},"signMode":"or"},
    {"order":2,"name":"总经理审批","type":"approval","handler":{"roleCode":"gm"},"signMode":"or"},
    {"order":3,"name":"行政询价","type":"handle","handler":{"roleCode":"admin_staff"},"signMode":"or"},
    {"order":4,"name":"总经理审批","type":"approval","handler":{"roleCode":"gm"},"signMode":"or"},
    {"order":5,"name":"出纳支付","type":"handle","handler":{"roleCode":"cashier"},"signMode":"or"},
    {"order":6,"name":"创建费用单","type":"auto"},
    {"order":7,"name":"行政采购","type":"handle","handler":{"roleCode":"admin_staff"},"signMode":"or"},
    {"order":8,"name":"资产入库","type":"handle","handler":{"roleCode":"admin_staff"},"signMode":"or"},
    {"order":9,"name":"创建资产卡片","type":"auto"},
    {"order":10,"name":"抄送往来会计","type":"cc","ccRoles":["accountant"]}
  ]
}'::jsonb
WHERE code = 'asset_purchase';

-- 4b. asset_maintenance: 更新 workflow_def
UPDATE oa_form_types
SET workflow_def = '{
  "nodes": [
    {"order":1,"name":"需求提报","type":"approval","handler":{"roleCode":"admin"},"signMode":"or"},
    {"order":2,"name":"行政询价","type":"handle","handler":{"roleCode":"admin_staff"},"signMode":"or","condition":{"field":"estimatedCost","operator":">=","value":500}},
    {"order":3,"name":"总经理审批","type":"approval","handler":{"roleCode":"gm"},"signMode":"or"},
    {"order":4,"name":"财务支付","type":"handle","handler":{"roleCode":"cashier"},"signMode":"or"},
    {"order":5,"name":"创建费用单","type":"auto"},
    {"order":6,"name":"抄送往来会计","type":"cc","ccRoles":["accountant"]}
  ]
}'::jsonb
WHERE code = 'asset_maintenance';

-- 4c. asset_disposal: 更新 workflow_def
UPDATE oa_form_types
SET workflow_def = '{
  "nodes": [
    {"order":1,"name":"总经理审批","type":"approval","handler":{"roleCode":"gm"},"signMode":"or"},
    {"order":2,"name":"创建清理单","type":"auto"}
  ]
}'::jsonb
WHERE code = 'asset_disposal';

-- 5. asset_purchase: 修正 field_permissions 键位（126 按旧8节点写入，需适配新10节点）
--    旧 "6"→新 "7"（行政采购）
--    旧 "7"→新 "8"（资产入库）
--    使用单个 UPDATE 原子操作，避免覆盖丢失
UPDATE oa_form_types
SET field_permissions = (
  (field_permissions)::jsonb - '6'
) || jsonb_build_object(
  'nodes',
  jsonb_set(
    (field_permissions->'nodes')::jsonb - '6' - '7',
    '{7}',
    COALESCE(field_permissions->'nodes'->'6', '{}'::jsonb)
  ) || jsonb_build_object(
    '8',
    COALESCE(field_permissions->'nodes'->'7', '{}'::jsonb)
  )
)
WHERE code = 'asset_purchase'
  AND field_permissions IS NOT NULL
  AND (field_permissions->'nodes' ? '6' OR field_permissions->'nodes' ? '7');

COMMIT;
