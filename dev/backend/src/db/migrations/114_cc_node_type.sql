-- 114: CC 节点升级为正式流程节点
-- 将抄送从 WorkflowDef 附属机制升级为 NodeType = 'cc' 的正式流程节点

-- 1. 删除旧 CHECK 约束（migration 109 创建）
ALTER TABLE oa_approval_nodes DROP CONSTRAINT IF EXISTS chk_node_type;

-- 2. 添加新约束（包含 'cc' 类型，NOT VALID 避免全表扫描锁表）
ALTER TABLE oa_approval_nodes ADD CONSTRAINT chk_node_type
  CHECK (node_type IN ('approval', 'handle', 'auto', 'cc')) NOT VALID;

-- 3. 验证约束
ALTER TABLE oa_approval_nodes VALIDATE CONSTRAINT chk_node_type;

-- 4. oa_approval_cc 新增可选关联列（支持按节点查询抄送人，NULL 表示旧机制数据）
ALTER TABLE oa_approval_cc ADD COLUMN IF NOT EXISTS source_node_order INTEGER;
COMMENT ON COLUMN oa_approval_cc.source_node_order IS
  '触发抄送的 CC 节点 order，NULL 表示旧机制数据';

-- 5. 索引优化（按节点查询抄送人）
CREATE INDEX IF NOT EXISTS idx_oa_cc_node_order
  ON oa_approval_cc(instance_id, source_node_order)
  WHERE source_node_order IS NOT NULL;

-- 6. 清理待执行的旧 trigger_cc 异步任务
DELETE FROM oa_async_tasks WHERE type = 'trigger_cc' AND status = 'pending';

-- 7. workflow_def 已由迁移 112 清空为 '{}'::jsonb（代码为唯一来源）
--    CC 节点配置在代码 form-types/*.ts 中定义，运行时通过 resolveWorkflowDef() 提供
--    无需在 DB 中更新 workflow_def
