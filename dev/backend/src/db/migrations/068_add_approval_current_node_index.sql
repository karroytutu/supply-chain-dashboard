-- 为审批节点获取查询添加复合索引
-- 优化 JOIN oa_approval_instances ON id WHERE current_node_order = ... 的查询性能
CREATE INDEX IF NOT EXISTS idx_oa_instances_current_node
ON oa_approval_instances(id, current_node_order);
