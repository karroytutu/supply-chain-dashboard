-- 109: OA 审批环节分类体系重构
-- 参考钉钉 OA：审批人/办理人/自动执行 三种环节类型
-- 1. data_input + countersign → handle (办理) / approval (审批)
-- 2. 移除 workflow_def 中的 interactionType 字段（已废弃）
-- 3. 新增 node_type CHECK 约束
-- 4. 新增 auto 节点查询部分索引

-- ============================================
-- A. 节点表数据迁移
-- ============================================

-- 1. data_input → handle（办理环节）
UPDATE oa_approval_nodes SET node_type = 'handle'
  WHERE node_type = 'data_input';

-- 2. countersign → approval（加签节点本质是审批节点，is_countersign 布尔字段保留溯源）
UPDATE oa_approval_nodes SET node_type = 'approval'
  WHERE node_type = 'countersign';

-- ============================================
-- B. workflow_def JSON 迁移
-- ============================================

-- 3. 替换节点类型值
--    data_input → handle
--    countersign → approval（防御性处理，workflow_def 中通常不出现 countersign）
--    注意：PostgreSQL JSONB 输出格式在冒号后有空格，需同时处理两种格式
UPDATE oa_form_types
SET workflow_def = replace(
      replace(
        replace(
          replace(workflow_def::text,
            '"type":"data_input"', '"type":"handle"'),
          '"type": "data_input"', '"type": "handle"'),
        '"type":"countersign"', '"type":"approval"'),
      '"type": "countersign"', '"type": "approval"')::jsonb
WHERE workflow_def::text LIKE '%data_input%' OR workflow_def::text LIKE '%countersign%';

-- 4. 移除 interactionType 字段（已废弃，节点类型本身决定按钮样式）
--    PostgreSQL JSONB 输出格式在冒号后有空格，需同时处理两种格式
UPDATE oa_form_types
SET workflow_def = replace(
      replace(
        replace(
          replace(workflow_def::text,
            ',"interactionType":"operation"', ''),
          ', "interactionType": "operation"', ''),
        ',"interactionType":"approval"', ''),
      ', "interactionType": "approval"', '')::jsonb
WHERE workflow_def::text LIKE '%interactionType%';

-- 4b. 修复 ar_collection 节点1：approval(带operation交互) → handle（办理环节）
--     ar_collection 原始定义为 type:'approval' + interactionType:'operation'，
--     步骤3仅处理 data_input/countersign，步骤4仅移除 interactionType，
--     但代码已将此节点定义为 handle，需同步 DB 以保持一致
UPDATE oa_form_types
SET workflow_def = replace(workflow_def::text,
      '"type":"approval"', '"type":"handle"')::jsonb
WHERE code = 'ar_collection';

-- ============================================
-- C. 结构约束
-- ============================================

-- 5. 添加 CHECK 约束（NOT VALID 避免扫描全表，后续手动 VALIDATE）
ALTER TABLE oa_approval_nodes ADD CONSTRAINT chk_node_type
  CHECK (node_type IN ('approval', 'handle', 'auto')) NOT VALID;

-- 6. 验证数据完整性后启用约束
ALTER TABLE oa_approval_nodes VALIDATE CONSTRAINT chk_node_type;

-- 7. 新增部分索引优化 auto 节点查询（auto-node-operations.ts 中多处使用）
CREATE INDEX IF NOT EXISTS idx_oa_nodes_auto_pending
  ON oa_approval_nodes(instance_id, node_order)
  WHERE node_type = 'auto' AND status IN ('pending', 'failed');

-- ============================================
-- D. 更新列注释
-- ============================================
COMMENT ON COLUMN oa_approval_nodes.node_type IS '节点类型：approval(审批)/handle(办理)/auto(自动执行)';
